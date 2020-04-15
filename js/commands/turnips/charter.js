const zip = require('lodash/zip');

const {possiblePatterns, patternReducer,averageReducer, minWeekReducer}
    = require('./v2/optimizer');

const generateData = (filter) => {
    let patterns = possiblePatterns(filter);
    const patternCount = patterns.reduce((acc, cur) => acc + cur.length, 0);
    if (patternCount === 0) patterns = possiblePatterns([0, ...filter.slice(1)]);
    const minMaxPattern = patternReducer(patterns);
    const minMaxData = zip(...minMaxPattern);
    const avgPattern = patternReducer(patterns, averageReducer);
    const avgData = zip(...avgPattern);
    const [minWeekValue] = patternReducer(patterns, minWeekReducer);

    return{
        "buy_price": new Array(12).fill(filter[0] || null),
        "guaranteed_min": new Array(12).fill(minWeekValue || null),
        "daily_price": Array.from({ length: 12 }, (v, i) => filter[i + 1] || null),
        "average": avgData[0] ? avgData[0].map(Math.trunc) : new Array(12).fill(null),
        "maximum": minMaxData[1] || new Array(12).fill(null),
        "minimum": minMaxData[0] || new Array(12).fill(null)
    };
};

module.exports = {generateData};