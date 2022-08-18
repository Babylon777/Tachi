import { GetGameConfig, GetGamePTConfig } from "../config/config";
import type { ChartDocument, Game, IDStrings, Playtypes, SongDocument } from "..";
import type { Grades, integer } from "../types";

export function FormatInt(v: number): string {
	return v.toString();
}

export function FormatDifficulty(chart: ChartDocument, game: Game): string {
	if (game === "bms" || game === "pms") {
		const bmsChart = chart as ChartDocument<"bms:7K" | "bms:14K">;

		return (
			bmsChart.data.tableFolders.map((e) => `${e.table}${e.level}`).join(", ") || "Unrated"
		);
	}

	if (game === "itg") {
		const itgChart = chart as ChartDocument<"itg:Stamina">;

		return `${itgChart.data.difficultyTag} ${itgChart.level}`;
	}

	const gameConfig = GetGameConfig(game);

	if (gameConfig.validPlaytypes.length > 1) {
		return `${chart.playtype} ${chart.difficulty} ${chart.level}`;
	}

	return `${chart.difficulty} ${chart.level}`;
}

/**
 * Formats a chart's difficulty into a shorter variant. This handles a lot of
 * game-specific strange edge cases.
 */
export function FormatDifficultyShort(chart: ChartDocument, game: Game): string {
	const gameConfig = GetGameConfig(game);
	const gptConfig = GetGamePTConfig(game, chart.playtype);

	if (game === "itg") {
		const itgChart = chart as ChartDocument<"itg:Stamina">;

		return `S${itgChart.data.difficultyTag} ${chart.level}`;
	}

	const shortDiff = gptConfig.shortDifficulties[chart.difficulty] ?? chart.difficulty;

	if (game === "ddr") {
		return `${shortDiff}${chart.playtype}`;
	}

	if (gameConfig.validPlaytypes.length === 1 || game === "gitadora") {
		return `${shortDiff} ${chart.level}`;
	}

	if (game === "usc") {
		return `${chart.playtype === "Controller" ? "CON" : "KB"} ${shortDiff} ${chart.level}`;
	}

	return `${chart.playtype}${shortDiff} ${chart.level}`;
}

export function FormatGame(game: Game, playtype: Playtypes[Game]): string {
	const gameConfig = GetGameConfig(game);

	if (gameConfig.validPlaytypes.length === 1) {
		return gameConfig.name;
	}

	return `${gameConfig.name} (${playtype})`;
}

export function FormatChart(game: Game, song: SongDocument, chart: ChartDocument): string {
	if (game === "bms") {
		const tables = (chart as ChartDocument<"bms:7K" | "bms:14K">).data.tableFolders;

		const bmsSong = song as SongDocument<"bms">;

		let realTitle = bmsSong.title;

		if (bmsSong.data.subtitle) {
			realTitle = `${realTitle} - ${bmsSong.data.subtitle}`;
		}

		if (bmsSong.data.genre) {
			realTitle = `${realTitle} [${bmsSong.data.genre}]`;
		}

		if (tables.length === 0) {
			return realTitle;
		}

		return `${realTitle} (${tables.map((e) => `${e.table}${e.level}`).join(", ")})`;
	} else if (game === "usc") {
		const uscChart = chart as ChartDocument<"usc:Controller" | "usc:Keyboard">;

		// If this chart isn't an official, render it differently
		if (!uscChart.data.isOfficial) {
			// Same as BMS. turn this into SongTitle (Keyboard MXM normal1, insane2)
			return `${song.title} (${chart.playtype} ${
				chart.difficulty
			} ${uscChart.data.tableFolders.map((e) => `${e.table}${e.level}`).join(", ")})`;
		} else if (uscChart.data.tableFolders.length !== 0) {
			// if this chart is an official **AND** is on tables (unlikely), render
			// it as so:

			// SongTitle (Keyboard MXM 17, normal1, insane2)
			return `${song.title} (${chart.playtype} ${chart.difficulty} ${
				chart.level
			}, ${uscChart.data.tableFolders.map((e) => `${e.table}${e.level}`).join(", ")})`;
		}

		// otherwise, it's just an official and should be rendered like any other game.
	} else if (game === "itg") {
		const itgChart = chart as ChartDocument<"itg:Stamina">;
		const itgSong = song as SongDocument<"itg">;

		return `${itgSong.title}${itgSong.data.subtitle ? ` ${itgSong.data.subtitle}` : ""} ${
			itgChart.data.difficultyTag
		} ${chart.level}`;
	}

	const gameConfig = GetGameConfig(game);

	let playtypeStr = `${chart.playtype} `;

	if (gameConfig.validPlaytypes.length === 1) {
		playtypeStr = "";
	}

	// return the most recent version this chart appeared in if it
	// is not primary.
	if (!chart.isPrimary) {
		return `${song.title} (${playtypeStr}${chart.difficulty} ${chart.level} ${chart.versions[0]})`;
	}

	return `${song.title} (${playtypeStr}${chart.difficulty} ${chart.level})`;
}

export function AbsoluteGradeDelta<I extends IDStrings = IDStrings>(
	game: Game,
	playtype: Playtypes[Game],
	score: number,
	percent: number,
	gradeOrIndex: Grades[I] | integer
): number {
	const gptConfig = GetGamePTConfig(game, playtype);

	if (!gptConfig.gradeBoundaries) {
		return 0;
	}

	const maxScore = Math.round(score * (100 / percent));

	const gradeIndex =
		typeof gradeOrIndex === "number" ? gradeOrIndex : gptConfig.grades.indexOf(gradeOrIndex);

	const gradeValue = gptConfig.gradeBoundaries[gradeIndex];

	if (gradeValue === undefined) {
		throw new Error(`Grade Index ${gradeIndex} has no corresponding grade value?`);
	}

	const gradeScore = Math.ceil((gradeValue / 100) * maxScore);

	return score - gradeScore;
}

export function RelativeGradeDelta<I extends IDStrings = IDStrings>(
	game: Game,
	playtype: Playtypes[Game],
	score: number,
	percent: number,
	grade: Grades[I],
	relativeIndex: integer
): { grade: string; delta: number } | null {
	const gptConfig = GetGamePTConfig(game, playtype);

	const nextGradeIndex = gptConfig.grades.indexOf(grade) + relativeIndex;

	if (nextGradeIndex < 0 || nextGradeIndex >= gptConfig.grades.length) {
		return null;
	}

	const nextGrade = gptConfig.grades[nextGradeIndex];

	if (nextGrade === undefined) {
		throw new Error(
			`Unexpectedly found no grade at index ${nextGradeIndex} for ${game} ${playtype}.`
		);
	}

	return {
		grade: nextGrade,
		delta: AbsoluteGradeDelta(game, playtype, score, percent, nextGradeIndex),
	};
}

function WrapGrade(grade: string) {
	if (grade.endsWith("-") || grade.endsWith("+")) {
		return `(${grade})`;
	}

	return grade;
}

export function GenericFormatGradeDelta<I extends IDStrings = IDStrings>(
	game: Game,
	playtype: Playtypes[Game],
	score: number,
	percent: number,
	grade: Grades[I],
	formatNumFn: (n: number) => number = (s) => s
): {
	lower: string;
	upper?: string;
	closer: "lower" | "upper";
} {
	const upper = RelativeGradeDelta(game, playtype, score, percent, grade, 1);
	const lower = AbsoluteGradeDelta(game, playtype, score, percent, grade);

	const formatLower = `${WrapGrade(grade)}+${formatNumFn(lower)}`;

	if (!upper) {
		return {
			lower: formatLower,
			closer: "lower",
		};
	}

	const formatUpper = `${WrapGrade(upper.grade)}${formatNumFn(upper.delta)}`;

	return {
		lower: formatLower,
		upper: formatUpper,
		closer: upper.delta + lower < 0 ? "lower" : "upper",
	};
}

export function FormatSieglindeBMS(sgl: number): string {
	const fixedSgl = sgl.toFixed(2);

	if (sgl < 13) {
		return `${fixedSgl} (☆${fixedSgl})`;
	}

	return `${fixedSgl} (★${(sgl - 12).toFixed(2)})`;
}

export function FormatSieglindePMS(sgl: number): string {
	const fixedSgl = sgl.toFixed(2);

	if (sgl < 13) {
		return `${fixedSgl} (○${fixedSgl})`;
	}

	return `${fixedSgl} (●${(sgl - 12).toFixed(2)})`;
}
