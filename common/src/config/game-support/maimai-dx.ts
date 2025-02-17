import { FAST_SLOW_MAXCOMBO } from "./_common";
import { FmtPercent } from "../../utils/util";
import { ClassValue, NoDecimalPlace } from "../config-utils";
import { p } from "prudence";
import { z } from "zod";
import type { INTERNAL_GAME_CONFIG, INTERNAL_GAME_PT_CONFIG } from "../../types/internals";

export const MAIMAI_DX_CONF = {
	name: "maimai DX",
	playtypes: ["Single"],
	songData: z.strictObject({
		displayVersion: z.string(),
	}),
} as const satisfies INTERNAL_GAME_CONFIG;

const MaimaiDXDans = [
	ClassValue("DAN_1", "初段", "1st Dan"),
	ClassValue("DAN_2", "二段", "2nd Dan"),
	ClassValue("DAN_3", "三段", "3rd Dan"),
	ClassValue("DAN_4", "四段", "4th Dan"),
	ClassValue("DAN_5", "五段", "5th Dan"),
	ClassValue("DAN_6", "六段", "6th Dan"),
	ClassValue("DAN_7", "七段", "7th Dan"),
	ClassValue("DAN_8", "八段", "8th Dan"),
	ClassValue("DAN_9", "九段", "9th Dan"),
	ClassValue("DAN_10", "十段", "10th Dan"),

	ClassValue("SHINDAN_1", "真初段", "Shinshodan"),
	ClassValue("SHINDAN_2", "真二段", "2nd Shindan"),
	ClassValue("SHINDAN_3", "真三段", "3rd Shindan"),
	ClassValue("SHINDAN_4", "真四段", "4th Shindan"),
	ClassValue("SHINDAN_5", "真五段", "5th Shindan"),
	ClassValue("SHINDAN_6", "真六段", "6th Shindan"),
	ClassValue("SHINDAN_7", "真七段", "7th Shindan"),
	ClassValue("SHINDAN_8", "真八段", "8th Shindan"),
	ClassValue("SHINDAN_9", "真九段", "9th Shindan"),
	ClassValue("SHINDAN_10", "真十段", "10th Shindan"),

	ClassValue("SHINKAIDEN", "真皆伝", "Shinkaiden"),
];

const MaimaiDXColours = [
	ClassValue("WHITE", "White"),
	ClassValue("BLUE", "Blue"),
	ClassValue("GREEN", "Green"),
	ClassValue("YELLOW", "Yellow"),
	ClassValue("RED", "Red"),
	ClassValue("PURPLE", "Purple"),
	ClassValue("BRONZE", "Bronze"),
	ClassValue("SILVER", "Silver"),
	ClassValue("GOLD", "Gold"),
	ClassValue("PLATINUM", "Platinum"),
	ClassValue("RAINBOW", "Rainbow"),
];

export const MAIMAI_DX_SINGLE_CONF = {
	providedMetrics: {
		percent: {
			type: "DECIMAL",
			validate: p.isBetween(0, 101),
			formatter: FmtPercent,
			description:
				"The percent this score was worth. Sometimes called 'rate' in game. This is between 0 and 101.",
		},
		lamp: {
			type: "ENUM",
			values: ["FAILED", "CLEAR", "FULL COMBO", "FULL COMBO+", "ALL PERFECT", "ALL PERFECT+"],
			minimumRelevantValue: "CLEAR",
			description: "The type of clear this score was.",
		},
	},

	derivedMetrics: {
		grade: {
			type: "ENUM",
			values: [
				"D",
				"C",
				"B",
				"BB",
				"BBB",
				"A",
				"AA",
				"AAA",
				"S",
				"S+",
				"SS",
				"SS+",
				"SSS",
				"SSS+",
			],
			minimumRelevantValue: "A",
			description: "The grade this score was.",
		},
	},

	defaultMetric: "percent",
	preferredDefaultEnum: "grade",

	optionalMetrics: FAST_SLOW_MAXCOMBO,

	scoreRatingAlgs: {
		rate: { description: "Rating as it's implemented in game.", formatter: NoDecimalPlace },
	},
	sessionRatingAlgs: {
		rate: {
			description: "The average of your best 10 ratings this session.",
			formatter: NoDecimalPlace,
		},
	},
	profileRatingAlgs: {
		naiveRate: {
			description: "A naive rating algorithm that just sums your 50 best scores.",
			formatter: NoDecimalPlace,
		},
		rate: {
			description:
				"Rating as it's implemented in game, taking 15 scores from the latest version and 35 from all old versions.",
			formatter: NoDecimalPlace,
		},
	},

	defaultScoreRatingAlg: "rate",
	defaultSessionRatingAlg: "rate",
	defaultProfileRatingAlg: "naiveRate",

	difficulties: {
		type: "FIXED",
		order: [
			"Basic",
			"Advanced",
			"Expert",
			"Master",
			"Re:Master",
			"DX Basic",
			"DX Advanced",
			"DX Expert",
			"DX Master",
			"DX Re:Master",
		],
		shorthand: {
			Basic: "BAS",
			Advanced: "ADV",
			Expert: "EXP",
			Master: "MAS",
			"Re:Master": "Re:MAS",
			"DX Basic": "DX BAS",
			"DX Advanced": "DX ADV",
			"DX Expert": "DX EXP",
			"DX Master": "DX MAS",
			"DX Re:Master": "DX Re:MAS",
		},
		default: "Master",
	},

	classes: {
		colour: {
			type: "DERIVED",
			values: MaimaiDXColours,
		},
		dan: {
			type: "PROVIDED",
			values: MaimaiDXDans,
		},
	},

	orderedJudgements: ["pcrit", "perfect", "great", "good", "miss"],

	versions: {
		universeplus: "UNiVERSE PLUS",
	},

	chartData: z.strictObject({
		isLatest: z.boolean(),
	}),

	preferences: z.strictObject({}),
	scoreMeta: z.strictObject({}),

	supportedMatchTypes: ["songTitle", "tachiSongID"],
} as const satisfies INTERNAL_GAME_PT_CONFIG;
