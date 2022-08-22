import SieglindeV0Calc from "./calc/v0";
import GetTableData from "./fetch-tables";
import logger from "./logger";
import { Command } from "commander";
import fs from "fs";

if (require.main !== module) {
	logger.error(`The script main.ts must be invoked directly!`);
	process.exit(-1);
}

const program = new Command();

program
	.option("-v, --version <The Sieglinde Version to calculate>")
	.option("-o, --out <Where to output JSON>");

program.parse(process.argv);
const options = program.opts();

if (!options.out) {
	logger.error(`Need to provide an --out parameter for output!`);
	process.exit(-1);
}

const version = Number(options.version) ?? 0;

function WriteOut(data: string) {
	fs.writeFileSync(options.out, data);
}

void (async () => {
	let calcFn;

	if (version === 0) {
		calcFn = SieglindeV0Calc;
	} else if (version === 1) {
		calcFn = SieglindeV1Calc;
	} else {
		throw new Error(`Unknown sieglinde version ${version}.`);
	}

	fs.mkdirSync(`${__dirname}/cache`, { recursive: true });

	const tableInfo = await GetTableData();

	logger.info(`Starting...`);

	const calcData = [];

	let i = 1;

	for (const table of tableInfo) {
		logger.info(`Running for table ${table.table.name}. ${i}/${tableInfo.length}`);

		// literally all the parallelism in this codebase has to be turned off because
		// the lr2ir runs off of a toaster which attempts to gut you if you make more than one
		// request a second.
		// eslint-disable-next-line no-await-in-loop
		calcData.push(await calcFn(table));

		WriteOut(JSON.stringify(calcData.flat(1)));

		i++;
	}

	WriteOut(JSON.stringify(calcData.flat(1)));

	logger.info(`Finished!`);
})();
