import monk from "monk";
import { Command } from "commander";
import CreateLogCtx from "../src/logger";
import { IndexOptions } from "mongodb";
import { ValidDatabases } from "kamaitachi-common";

const logger = CreateLogCtx("set-indexes.ts");

const program = new Command();

program.option("-d, --db <database>", "The database to index.");
program.option(
    "-r, --reset",
    "Whether to reset all indexes on this database before indexing or not."
);

program.parse(process.argv);
const options = program.opts();

const db = monk(`${process.env.MONGO_BASE_URL ?? "127.0.0.1"}/${options.db ?? "ktblackdb"}`);

interface Index {
    fields: Record<string, unknown>;
    options?: IndexOptions;
}

function index(fields: Record<string, unknown>, options?: IndexOptions) {
    return { fields, options };
}

const UNIQUE = { unique: true };

const indexes: Partial<Record<ValidDatabases, Index[]>> = {
    scores: [index({ scoreID: 1 }, UNIQUE)],
    "score-pbs": [
        index({ chartID: 1, userID: 1 }, UNIQUE),
        index({ chartID: 1, "scoreData.percent": 1 }),
    ],
    "charts-iidx": [
        index({ chartID: 1 }, UNIQUE),
        index({ songID: 1, difficulty: 1, playtype: 1, isPrimary: 1 }, UNIQUE),
    ],
    "songs-iidx": [index({ id: 1 }, UNIQUE), index({ title: 1 })],
    sessions: [
        // lol
        index({ timeStarted: 1, timeEnded: 1, userID: 1, game: 1, playtype: 1 }),
    ],
    "game-stats": [index({ userID: 1, game: 1, playtype: 1 }, UNIQUE)],
    "folder-chart-lookup": [index({ chartID: 1, folderID: 1 }, UNIQUE)],
    "tierlist-data": [
        index({ tierlistDataID: 1 }, UNIQUE),
        index({ chartID: 1, tierlistID: 1 }),
        index({ chartID: 1, tierlistID: 1, type: 1 }),
        index({ chartID: 1, tierlistID: 1, type: 1, key: 1 }, UNIQUE),
    ],
};

(async () => {
    logger.info(`Starting indexing for ${options.db}...`);

    for (const collection in indexes) {
        if (options.reset) {
            // eslint-disable-next-line no-await-in-loop
            await db.get(collection).dropIndexes();
        }

        // @ts-expect-error drunkts
        for (const index of indexes[collection]) {
            // eslint-disable-next-line no-await-in-loop
            let r = await db.get(collection).createIndex(index.fields, index.options);

            logger.info(r);
        }
    }

    logger.info("Done.");
})();
