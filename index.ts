import * as os from "os";
import * as fs from "fs-extra";
import * as _ from "lodash";

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

const process = async (index: number) => {
    const data: Data = fs.readJSONSync(`./data/data${index}.json`)
    //console.log(`data`, data);
    const g = data.calibration
    let calibrated = data.data.map(value => {
        const [relativeTimestamp, rx, ry, rz] = value
        return [
            //(data.timestamp - data.referenceTime) * 1000 + timestamp,

            (g[0][0] * rx + g[0][1] * ry + g[0][2] * rz) / data.oneG * 9.81,
            (g[1][0] * rx + g[1][1] * ry + g[1][2] * rz) / data.oneG * 9.81,
            ((g[2][0] * rx + g[2][1] * ry + g[2][2] * rz) / data.oneG * 9.81) + 9.81,
            relativeTimestamp,
        ]
    });
    const sub3 = (v1: number[], v2: number[]) => [v1[0] - v2[0], v1[1] - v2[1], v1[2] - v2[2]]
    const sub4 = (v1: number[], v2: number[]) => [v1[0] - v2[0], v1[1] - v2[1], v1[2] - v2[2], v1[3] - v2[3]]
    const module = (v1: number[]) => Math.sqrt(Math.pow(v1[0], 2) + Math.pow(v1[1], 2) + Math.pow(v1[2], 2))
    let deltas = calibrated.map((value, index, array) => {
        if (index === 0) return [0, 0, 0, 1]  ;
        return sub4(array[index], array[index - 1])
    });
    let scaledDeltas = deltas.map((v: number[], index, array) => {
        return [v[0]/v[3], v[0]/v[3], v[0]/v[3], v[0]/v[3]]
    });
    let scaledDeltasModules = deltas.map((value, index, array) => {
        return module(value)
    });
    let deltaModulesWithIndex = scaledDeltasModules.map((m, i) => [i, m]);
    const result = {
        //calibrated: calibrated,
        //deltas: deltas,
        //deltaModules: deltaModulesWithIndex,
        scaledDeltas: scaledDeltas,
        crashes: _.sortBy(deltaModulesWithIndex, mwi => mwi[1] * -1)
    }
    let csv = `ts,rx,ry,rz` + os.EOL
    //result.calibrated.forEach(e => {
    //      csv += `${e[0]},${e[1]},${e[2]},${e[3]}` + os.EOL
    //  })
    fs.writeJSONSync(`processed/result${index}.json`, result)
    //fs.writeFileSync('result1.csv', csv)
}
const start = async () => {
    for (let i = 1; i < 6; i++) {
        console.log(`Processing ${i}`);
        await process(i);
    }
}

start()
