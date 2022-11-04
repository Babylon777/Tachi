/* eslint-disable require-atomic-updates */
import { InternalFailure } from "../common/converter-failures";
import db from "external/mongo/db";
import { Volforce } from "rg-stats";
import { DeleteUndefinedProps } from "utils/misc";
import { FindChartWithChartID } from "utils/queries/charts";
import type { KtLogger } from "lib/logger/logger";
import type { PBScoreDocument, ScoreDocument } from "tachi-common";

export async function IIDXMergeFn(
	pbDoc: PBScoreDocument<"iidx:DP" | "iidx:SP">,
	scorePB: ScoreDocument<"iidx:DP" | "iidx:SP">,
	lampPB: ScoreDocument<"iidx:DP" | "iidx:SP">,
	logger: KtLogger
): Promise<boolean> {
	// lampRating needs to be updated.
	pbDoc.calculatedData.ktLampRating = lampPB.calculatedData.ktLampRating;

	// Update lamp related iidx-specific info from the lampPB.
	pbDoc.scoreData.hitMeta.gsm = lampPB.scoreData.hitMeta.gsm;
	pbDoc.scoreData.hitMeta.gauge = lampPB.scoreData.hitMeta.gauge;
	pbDoc.scoreData.hitMeta.gaugeHistory = lampPB.scoreData.hitMeta.gaugeHistory;
	pbDoc.scoreData.hitMeta.comboBreak = lampPB.scoreData.hitMeta.comboBreak;

	DeleteUndefinedProps(pbDoc.scoreData.hitMeta);

	await MergeBPPB(pbDoc, scorePB, lampPB, logger);

	return true;
}

export function PopnMergeFn(
	pbDoc: PBScoreDocument<"popn:9B">,
	scorePB: ScoreDocument<"popn:9B">,
	lampPB: ScoreDocument<"popn:9B">,
	_logger: KtLogger
) {
	pbDoc.scoreData.hitMeta.specificClearType = lampPB.scoreData.hitMeta.specificClearType;

	return true;
}

export async function BMSMergeFn(
	pbDoc: PBScoreDocument<"bms:7K" | "bms:14K">,
	scorePB: ScoreDocument<"bms:7K" | "bms:14K">,
	lampPB: ScoreDocument<"bms:7K" | "bms:14K">,
	logger: KtLogger
) {
	pbDoc.calculatedData.sieglinde = lampPB.calculatedData.sieglinde;

	pbDoc.scoreData.hitMeta.gaugeHistory = lampPB.scoreData.hitMeta.gaugeHistory;
	pbDoc.scoreData.hitMeta.gauge = lampPB.scoreData.hitMeta.gauge;

	await MergeBPPB(pbDoc, scorePB, lampPB, logger);

	return true;
}

export async function PMSMergeFn(
	pbDoc: PBScoreDocument<"pms:Controller" | "pms:Keyboard">,
	scorePB: ScoreDocument<"pms:Controller" | "pms:Keyboard">,
	lampPB: ScoreDocument<"pms:Controller" | "pms:Keyboard">,
	logger: KtLogger
) {
	pbDoc.calculatedData.sieglinde = lampPB.calculatedData.sieglinde;

	await MergeBPPB(pbDoc, scorePB, lampPB, logger);

	return true;
}

/**
 * This function recalculates and applies VF6 to the PB document.
 *
 * This is near-identical to the SDVXMergeFn. See that.
 */
export async function USCMergeFn(
	pbDoc: PBScoreDocument<"usc:Controller" | "usc:Keyboard">,
	scorePB: ScoreDocument<"usc:Controller" | "usc:Keyboard">,
	lampPB: ScoreDocument<"usc:Controller" | "usc:Keyboard">,
	logger: KtLogger
) {
	// @optimisable - see SDVXMergeFn
	const chart = await FindChartWithChartID("usc", pbDoc.chartID);

	if (!chart) {
		logger.severe(`Chart ${pbDoc.chartID} disappeared underfoot?`);
		throw new InternalFailure(`Chart ${pbDoc.chartID} disappeared underfoot?`);
	}

	pbDoc.calculatedData.VF6 = Volforce.calculateVF6(
		pbDoc.scoreData.score,
		pbDoc.scoreData.lamp,
		chart.levelNum
	);

	return true;
}

/**
 * This function recalculates and applies VF6 to the PB document.
 *
 * SDVX cannot just select the larger volforce - instead, volforce has to be
 * re-calculated for any different permutation of scorePB + lampPB.
 */
export async function SDVXMergeFn(
	pbDoc: PBScoreDocument<"sdvx:Single">,
	scorePB: ScoreDocument<"sdvx:Single">,
	lampPB: ScoreDocument<"sdvx:Single">,
	logger: KtLogger
): Promise<boolean> {
	// @optimisable
	// This is a re-fetch, but it's difficult to pass the chart all
	// the way down here due to how chartIDs (set) works. :(
	const chart = await FindChartWithChartID("sdvx", pbDoc.chartID);

	if (!chart) {
		logger.severe(`Chart ${pbDoc.chartID} disappeared underfoot?`);
		throw new InternalFailure(`Chart ${pbDoc.chartID} disappeared underfoot?`);
	}

	pbDoc.calculatedData.VF6 = Volforce.calculateVF6(
		pbDoc.scoreData.score,
		pbDoc.scoreData.lamp,
		chart.levelNum
	);

	// find the users score with the highest exScore
	const bestExScore = (await db.scores.findOne(
		{
			chartID: pbDoc.chartID,
			"scoreData.hitMeta.exScore": { $type: "number" },
		},
		{
			sort: {
				"scoreData.hitMeta.exScore": -1,
			},
		}
	)) as ScoreDocument<"sdvx:Single"> | null;

	if (!bestExScore) {
		pbDoc.scoreData.hitMeta.exScore = undefined;
	} else {
		pbDoc.scoreData.hitMeta.exScore = bestExScore.scoreData.hitMeta.exScore;

		pbDoc.composedFrom.other = [{ name: "exScorePB", scoreID: bestExScore.scoreID }];
	}

	return true;
}

type IDStringsWithBP =
	| "bms:7K"
	| "bms:14K"
	| "iidx:DP"
	| "iidx:SP"
	| "pms:Controller"
	| "pms:Keyboard";

/**
 * Given typical PB-Merge information, fetch the best `bp` for this user's scores
 * on this chart and merge it with the `pbDoc` if it's large enough.
 *
 * @returns NOTHING, mutates original input.
 */
async function MergeBPPB(
	pbDoc: PBScoreDocument<IDStringsWithBP>,
	scorePB: ScoreDocument<IDStringsWithBP>,
	lampPB: ScoreDocument<IDStringsWithBP>,
	logger: KtLogger
) {
	// bad+poor PB document. This is a weird, third indepdenent metric that IIDX players sometimes care about.
	const bpPB = (await db.scores.findOne(
		{
			userID: scorePB.userID,
			chartID: scorePB.chartID,
			"scoreData.hitMeta.bp": { $exists: true },
		},
		{
			sort: {
				// bp 0 is the best BP, bp 1 is worse, so on
				"scoreData.hitMeta.bp": 1,
			},
		}
	)) as ScoreDocument<"iidx:DP" | "iidx:SP"> | null;

	if (!bpPB) {
		logger.verbose(
			`Could not find BP PB for ${scorePB.userID} ${scorePB.chartID} in PB joining. User likely has no scores with BP defined.`,
			{ pbDoc }
		);

		// this isn't actually an error! we just don't have to do anything.
		return;
	}

	// by default scorePB is chosen for hitMeta fields, so, we can skip any assignments here by returning here.
	if (bpPB.scoreID === scorePB.scoreID) {
		logger.debug(`Skipped merging BP PB as scorePB was also BP PB.`);
		return true;
	} else if (bpPB.scoreID === lampPB.scoreID) {
		pbDoc.scoreData.hitMeta.bp = lampPB.scoreData.hitMeta.bp;
		logger.debug(`Skipped adding BP PB as composedFrom because lampPB was also BP PB.`);
		return;
	}

	pbDoc.scoreData.hitMeta.bp = bpPB.scoreData.hitMeta.bp;

	pbDoc.composedFrom.other = [{ name: "Best BP", scoreID: bpPB.scoreID }];
}
