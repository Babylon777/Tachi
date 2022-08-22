import { VERSION_INFO } from "lib/constants/version";
import CreateLogCtx from "lib/logger/logger";
import { Environment, ServerConfig } from "lib/setup/config";
import { asyncExec } from "utils/misc";
import fs from "fs/promises";
import os from "os";
import path from "path";
import type { Game } from "tachi-common";

const logger = CreateLogCtx(__filename);

export type SeedsCollections =
	| "bms-course-lookup"
	| "folders"
	| "tables"
	| `charts-${Game}`
	| `songs-${Game}`;

/**
 * Class that encapsulates the behaviour of a seeds repo.
 */
export class DatabaseSeedsRepo {
	private readonly baseDir: string;
	private readonly logger;

	constructor(baseDir: string) {
		this.baseDir = baseDir;
		this.logger = CreateLogCtx(`DatabaseSeeds:${baseDir}`);
	}

	private CollectionNameToPath(collectionName: SeedsCollections) {
		return path.join(this.baseDir, "collections", `${collectionName}.json`);
	}

	/**
	 * Reads the data from a collection and returns the parsed JSON.
	 *
	 * @returns The data in the requested collection.
	 */
	async ReadCollection<D>(collectionName: SeedsCollections): Promise<Array<D>> {
		const data = await fs.readFile(this.CollectionNameToPath(collectionName), {
			encoding: "utf-8",
		});

		const parsedData = JSON.parse(data) as Array<D>;

		return parsedData;
	}

	/**
	 * Writes a new array to the provided collectionName.
	 *
	 * @param collectionName - The collection to write to.
	 * @param content - A new array of objects to write.
	 */
	async WriteCollection(collectionName: SeedsCollections, content: Array<unknown>) {
		await fs.writeFile(this.CollectionNameToPath(collectionName), JSON.stringify(content));

		// Deterministically sort whatever content we just wrote.
		await asyncExec(
			`cd "${this.baseDir}" || exit 1; node scripts/deterministic-collection-sort.js`
		);
	}

	async *IterateCollections() {
		const collectionNames = (await fs.readdir(path.join(this.baseDir, "collections"))).map(
			(e) => path.parse(e).name
		) as Array<SeedsCollections>;

		for (const collectionName of collectionNames) {
			// eslint-disable-next-line no-await-in-loop
			yield { collectionName, data: await this.ReadCollection(collectionName) };
		}
	}

	/**
	 * Mutate a collection with a given name.
	 *
	 * @param collectionName - The collection to mutate.
	 * @param mutator - A function that takes the entire collection as an array, then returns a new array.
	 */
	async MutateCollection<D>(
		collectionName: SeedsCollections,
		mutator: (dataset: Array<D>) => Array<D>
	) {
		const dataset = await this.ReadCollection<D>(collectionName);

		const newData = mutator(dataset);

		return this.WriteCollection(collectionName, newData);
	}

	/**
	 * Provide authentication so that CommitChangesBack can do its job.
	 */
	#AuthenticateWithGitServer() {
		if (!ServerConfig.SEEDS_CONFIG) {
			// Shouldn't be possible. Ever, since SEEDS_CONFIG must be deffed in order
			// to run PullDBSeeds
			throw new Error(`Cannot commit changes back. SEEDS_CONFIG is not set.`);
		}

		if (!ServerConfig.SEEDS_CONFIG.USER_NAME || !ServerConfig.SEEDS_CONFIG.USER_EMAIL) {
			throw new Error(
				`Cannot commit changes back if SEEDS_CONFIG.USER_NAME/SEEDS_CONFIG.USER_EMAIL aren't defined.`
			);
		}

		// @ereti is insistent that this sleep 1 is fine, so, whatever.
		return asyncExec(
			`git config user.name "${ServerConfig.SEEDS_CONFIG.USER_NAME}" || exit 3;
			git config user.email "${ServerConfig.SEEDS_CONFIG.USER_EMAIL}" || exit 4;
			git config credential.helper '!f() { sleep 1; echo "username=\${GIT_USER}"; echo "password=\${GIT_PASSWORD}"; }; f' || exit 5;`
		);
	}

	/**
	 * Checks for any diffs in the seeds repository we cloned. If there are any, commit them back
	 * to the repository.
	 *
	 * @param commitMsg - The commit message.
	 * @returns True when a commit has occured, false when it hasn't. Throws on failure.
	 */
	async CommitChangesBack(commitMsg: string) {
		this.logger.verbose(`Received commit-back request.`);

		try {
			const { stdout: statusOut } = await asyncExec(
				`cd "${this.baseDir}" || exit 1; git status --porcelain`
			);

			if (statusOut === "") {
				this.logger.info(`No changes. Not committing any changes back.`);
				return false;
			}

			// Ok, Testing this is actually a bad idea. Hear me out.
			// It's exceptionally difficult to actually store and look at the test output. (potentially huge)
			// especially when filesystem size is our biggest constraint at the moment.
			//
			// It's better for us to commit straight away, and have the tests on our github CI fail
			// (and subsequently yell at us.)
			//
			// try {
			// 	await asyncExec(`cd "${this.baseDir}/scripts" || exit 2; pnpm install; pnpm test`);
			// } catch ({ err, stdout, stderr }) {
			// 	logger.error(`Testing the changes failed. ${err}. Not committing back!`, { err });
			// 	throw err;
			// }

			this.logger.info(`Changes detected. Authenticating with Github.`);

			await this.#AuthenticateWithGitServer();

			const { stdout: commitOut } = await asyncExec(
				`cd "${this.baseDir}" || exit 2;
				git add . || exit 3;
				git commit -am "${commitMsg}" || exit 4;
				git push`
			);

			this.logger.info(`Commit: ${commitOut}.`);

			return true;
		} catch (err) {
			this.logger.error(`Failed to backport commits?`, { err });
			throw err;
		}
	}

	Destroy() {
		// scary
		return fs.rm(this.baseDir, { recursive: true, force: true });
	}
}

/**
 * Pulls the database seeds from github, returns an object that can be used to manipulate them.
 *
 * @param fetchFromLocalPath - Whether or not to fetch this from a local instance, like a
 * monorepo database-seeds directory.
 */
export async function PullDatabaseSeeds(fetchFromLocalPath: string | null = null) {
	if (fetchFromLocalPath) {
		return new DatabaseSeedsRepo(fetchFromLocalPath);
	}

	if (!ServerConfig.SEEDS_CONFIG) {
		throw new Error(`SEEDS_CONFIG was not defined. You cannot pull a seeds repo.`);
	}

	const seedsDir = await fs.mkdtemp(path.join(os.tmpdir(), "tachi-database-seeds-"));

	logger.info(`Cloning data to ${seedsDir}.`);

	await fs.rm(seedsDir, { recursive: true, force: true });

	try {
		// stderr in git clone is normal output.
		// stdout is for errors.
		// there were expletives below this comment, but I have removed them.
		const { stdout } = await asyncExec(
			`git clone --sparse --depth=1 "${ServerConfig.SEEDS_CONFIG.REPO_URL}" -b "${
				Environment.nodeEnv === "production"
					? `release/${VERSION_INFO.major}.${VERSION_INFO.minor}`
					: "staging"
			}" '${seedsDir}';
			
			
			cd '${seedsDir}';
			git sparse-checkout add database-seeds`

			// ^ now that we're in a monorepo, we only want the seeds.
		);

		// isn't that confusing
		if (stdout) {
			logger.error(stdout);
		}

		return new DatabaseSeedsRepo(`${seedsDir}/database-seeds`);
	} catch ({ err, stderr }) {
		logger.error(`Error cloning database-seeds. ${stderr}.`);
		throw err;
	}
}
