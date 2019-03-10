import * as os from "os";
import * as fs from "fs-extra";
import * as _ from "lodash";
import express from 'express'


// @ts-ignore
import {createCanvas, loadImage} from "canvas";

type Vector = number[]

interface Data {
    v: number,
    severity: number,
    id: number,
    timestamp: number,
    referenceTime: number,
    oneG: number,
    calibration: number[][],
    data: number[][],
    gpsData: number[][],
    pos: number

}

const index = async (index: number) => {
    const data: Data = fs.readJSONSync(`./data/data${index}.json`)
    //console.log(`data`, data);
    const g = data.calibration
    let calibrated = _.sortBy(data.data, d => d[0]).map(value => {
        const [relativeTimestamp, rx, ry, rz] = value
        return [
            //(data.timestamp - data.referenceTime) * 1000 + timestamp,

            (g[0][0] * rx + g[0][1] * ry + g[0][2] * rz) / data.oneG * 9.81 * 1000,
            (g[1][0] * rx + g[1][1] * ry + g[1][2] * rz) / data.oneG * 9.81 * 1000,
            (((g[2][0] * rx + g[2][1] * ry + g[2][2] * rz) / data.oneG * 9.81) + 9.81) * 1000,
            relativeTimestamp,
        ]
    });
    const sub3 = (v1: number[], v2: number[]) => [v1[0] - v2[0], v1[1] - v2[1], v1[2] - v2[2]]
    const mul3 = (v1: number[], n: number) => [v1[0] * n, v1[1] * n, v1[2] * n]
    const sub4 = (v1: number[], v2: number[]) => [v1[0] - v2[0], v1[1] - v2[1], v1[2] - v2[2], v1[3] - v2[3]]
    const module = (v1: number[]) => Math.sqrt(Math.pow(v1[0], 2) + Math.pow(v1[1], 2) + Math.pow(v1[2], 2))
    let deltas = calibrated.map((value, index, array) => {
        if (index === 0) return [0, 0, 0, 1];
        return sub4(array[index], array[index - 1])
    });
    let scaledDeltas = deltas.map((v: number[], index, array) => {
        let w = v[3];
        let scaled = [v[0] / w, v[1] / w, v[2] / w];
        return scaled
    });
    let scaledDeltasModules = deltas.map((value, index, array) => {
        return module(value)
    });
    let deltaModulesWithIndex = scaledDeltasModules.map((m, i) => [i, m]);
    let potentialCrashes = _.sortBy(deltaModulesWithIndex, mwi => mwi[1] * -1);
    let crashes: { index: number, max: number, vectors: number[][], vc: number }[] = [] // [centerIndex, avgModule]
    let r = 16000 / 2.5;
    for (const pc of potentialCrashes) {
        if (pc[1] < 3000) continue;
        let cindex = crashes.findIndex(c => (c.index < (pc[0] + r) && (c.index > (pc[0] - r))));
        if (cindex === -1) {
            crashes.push({index: pc[0], max: pc[1], vectors: [pc], vc: 1})
        } else {
            let oldIndex = crashes[cindex].index;
            crashes[cindex].index = Math.round((oldIndex * 3 + pc[0]) / 4);
            crashes[cindex].max = Math.max(crashes[cindex].max, pc[1]);
            //crashes[cindex].vectors.push(pc)
            crashes[cindex].vc++;
        }

    }
    let processedCrashes = crashes.map(c => {
        let mainvecindex = c.vectors[0][0]
        let direction = mul3(scaledDeltas[mainvecindex], -1)
        return {
            ...c,
            direction,
            d: deltas[40],
            raw: calibrated[40],
        }
    })
    const result = {
        //calibrated: calibrated,
        //deltas: deltas,
        //deltaModules: deltaModulesWithIndex,
        //scaledDeltas: scaledDeltas,
        crashCount: crashes.length,
        processedCrashes
    }
    let csv = `ts,rx,ry,rz` + os.EOL
    //result.calibrated.forEach(e => {
    //      csv += `${e[0]},${e[1]},${e[2]},${e[3]}` + os.EOL
    //  })
    fs.writeJSONSync(`processed/result${index}.json`, result)

    return result
    //fs.writeFileSync('result1.csv', csv)
}
let payload: { impactAngle: number; offsetMaximumForce: number; }[] = []
const start = async () => {
    let totals: any = {}
    for (let i = 1; i < 6; i++) {
        console.log(`Processing ${i}`);
        let processed = await index(i);
        totals['crashes' + i] = _.pick(processed, 'crashCount', 'processedCrashes.direction');

        console.log(totals);
        for (let j = 0; j < processed.crashCount; j++) {
            let crash = processed.processedCrashes[j]
            const image = await loadImage('image.png')
            let canvas = createCanvas(image.width, image.height)
            const ctx = canvas.getContext('2d')
            ctx.drawImage(image, 0, 0, image.width, image.height)
            ctx.fillStyle = 'white'
            ctx.fillRect(10, 10, 500, 60)
            ctx.fillStyle = 'black'
            ctx.font = '20px Impact'
            ctx.translate(20, 20)
            ctx.fillText(`Data ${i}/${5} Crash ${j + 1}/${processed.crashCount}`, 20, 15)
            ctx.fillText(`Intensity: ${(crash.max / 1000).toFixed(5)}`, 20, 40)
            ctx.translate(-20, -20)

            ctx.strokeStyle = 'rgba(155,0,0,1.0)'
            ctx.lineWidth = 10;
            ctx.beginPath()
            ctx.translate(image.width - 440, 282)
            let angle = Math.atan((crash.direction[0] / crash.direction[1]));
            ctx.rotate(angle)
            ctx.scale(1.2, 1)
            ctx.lineTo(100, 0)
            //ctx.lineTo(560, 614)
            ctx.lineTo(100 * Math.sqrt(crash.max / 1000), 0)
            ctx.stroke()

            //d line
            //fs.writeFileSync(`processed/c${i}_${j}.html`, '<img src="' + canvas.toDataURL() + '" />')
            const out = fs.createWriteStream(__dirname + `/processed/c${crash.vectors[0][0]}.png`)
            canvas.createPNGStream({}).pipe(out)
            payload.push({impactAngle: angle * 360 / (Math.PI / 2), offsetMaximumForce: crash.vectors[0][0]})
        }
    }


}


const startServer = async () => {
    await start()
    const app = express()
    const port = 3000

    app.get('/', (req, res) => {
        // language=HTML
        res.send(`
            <html>
            <h1>SenseAuto Crash Analysis API</h1>
            <ul>
                <li><a href="/api/v1/getCrashInfo">/api/v1/getCrashInfo</a></li>
                <li><a href="/api/v1/getCrashImage">/api/v1/getCrashImage</a></li>
            </ul>
            </html>`);
    })
    app.get('/api/v1/getCrashInfo', (req, res) => {
        res.send(JSON.stringify(payload));
    })
    app.get('/api/v1/getCrashImage', (req, res) => {
        if(req.query.timeOffsetMS == null) return res.send('Please provide timeOffsetMS')
        res.sendFile(`${__dirname}/processed/c${req.query.timeOffsetMS}.png`);
    })

    app.listen(port, () => console.log(`Example app listening on port ${port}!`))
}
startServer()
