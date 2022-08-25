import { APIFetchV1 } from "util/api";
import { ChangeOpacity } from "util/color-opacity";
import { CreateChartMap, CreateScoreIDMap, CreateSongMap } from "util/data";
import { PartialArrayRecordAssign } from "util/misc";
import DifficultyCell from "components/tables/cells/DifficultyCell";
import LampCell from "components/tables/cells/LampCell";
import ScoreCell from "components/tables/cells/ScoreCell";
import TitleCell from "components/tables/cells/TitleCell";
import MiniTable from "components/tables/components/MiniTable";
import Divider from "components/util/Divider";
import Icon from "components/util/Icon";
import Loading from "components/util/Loading";
import SelectButton from "components/util/SelectButton";
import deepmerge from "deepmerge";
import React, { useContext, useEffect, useMemo, useState } from "react";
import { useQuery } from "react-query";
import {
	ChartDocument,
	FolderDocument,
	Game,
	GamePTConfig,
	GetGamePTConfig,
	Grades,
	IDStrings,
	integer,
	Lamps,
	ScoreDocument,
	SessionScoreInfo,
	SongDocument,
	TableDocument,
} from "tachi-common";
import { SessionReturns } from "types/api-returns";
import { CommentModal, ModifyScore } from "components/tables/dropdowns/components/ScoreEditButtons";
import { SetState } from "types/react";
import { ScoreDataset } from "types/tables";
import { UserContext } from "context/UserContext";

type SetScores = (scores: ScoreDocument[]) => void;

export default function SessionRaiseBreakdown({
	sessionData,
	setScores,
}: {
	sessionData: SessionReturns;
	setScores: SetScores;
}) {
	const game = sessionData.session.game;
	const playtype = sessionData.session.playtype;

	// todo infer default table
	// const gptConfig = GetGamePTConfig(game, playtype);

	const [chartIDs, setChartIDs] = useState<string[] | null>([]);
	const [tableID, setTableID] = useState<string | null>(null);
	const [tableFolders, setTableFolders] = useState<FolderDocument[]>([]);
	const [folder, setFolder] = useState<FolderDocument | null>(null);
	const [filter, setFilter] = useState<"folder" | "all" | "highlighted">("all");

	useEffect(() => {
		if (!tableID) {
			return;
		}

		APIFetchV1(`/games/${game}/${playtype}/tables/${tableID}`).then((r) => {
			if (!r.success) {
				throw new Error(r.description);
			}

			// @ts-expect-error todo
			setTableFolders(r.body.folders);
			// @ts-expect-error todo
			setFolder(r.body.folders[r.body.folders.length - 1]);
		});
	}, [tableID]);

	useEffect(() => {
		if (filter !== "folder" || !folder) {
			setChartIDs(null);
			return;
		}

		APIFetchV1(`/games/${game}/${playtype}/folders/${folder.folderID}`).then((r) => {
			if (!r.success) {
				throw new Error(r.description);
			}

			// @ts-expect-error todo
			setChartIDs(r.body.charts.map((e) => e.chartID));
		});
	}, [folder, tableID, filter]);

	const { isLoading, error, data } = useQuery(`/games/${game}/${playtype}/tables`, async () => {
		const res = await APIFetchV1<TableDocument[]>(`/games/${game}/${playtype}/tables`);

		if (!res.success) {
			throw new Error(res.description);
		}

		return res.body;
	});
	const [view, setView] = useState<"lamps" | "both" | "grades">("both");

	useEffect(() => {
		if (tableID === null && (data?.length ?? 0) > 0) {
			setTableID(data![0].tableID);
		}
	}, [data]);

	if (error) {
		return <>{(error as Error).message}</>;
	}

	if (isLoading || !data) {
		return <Loading />;
	}

	return (
		<>
			<div className="col-12">
				<div className="row">
					<div className="col-12 col-lg-6 offset-lg-3">
						<div className="d-flex justify-content-center">
							<div className="btn-group">
								<SelectButton value={view} setValue={setView} id="lamps">
									<Icon type="lightbulb" />
									Lamps Only
								</SelectButton>

								<SelectButton value={view} setValue={setView} id="both">
									<Icon type="bolt" />
									Both
								</SelectButton>

								<SelectButton value={view} setValue={setView} id="grades">
									<Icon type="sort-alpha-up" />
									Grades Only
								</SelectButton>
							</div>
						</div>
					</div>

					<div className="col-lg-3 d-none d-lg-block">
						<select
							className="form-control ml-auto"
							value={filter}
							onChange={(e) => setFilter(e.target.value as any)}
						>
							<option value="all">No Filter</option>
							<option value="folder">Folder Filters</option>
							<option value="highlighted">Highlights Only</option>
						</select>
					</div>
					{filter === "folder" && (
						<>
							<div className="col-12">
								<Divider className="mt-4 mb-4" />
							</div>
							<div className="col-6">
								<select
									className="form-control"
									onChange={(e) => setTableID(e.target.value)}
								>
									{data.map((e) => (
										<option key={e.tableID} value={e.tableID}>
											{e.title}
										</option>
									))}
								</select>
							</div>
							<div className="col-6">
								<select
									className="form-control"
									value={folder?.folderID}
									onChange={(e) =>
										setFolder(
											tableFolders.find((f) => f.folderID === e.target.value)!
										)
									}
								>
									{tableFolders.map((e) => (
										<option key={e.folderID} value={e.folderID}>
											{e.title}
										</option>
									))}
								</select>
							</div>
						</>
					)}
				</div>

				<Divider className="mt-4 mb-4" />

				<div className="d-lg-block d-none mb-4">
					Tip: You can click on scores to highlight/add comments!
				</div>
			</div>
			<SessionScoreStatBreakdown {...{ sessionData, chartIDs, filter, view, setScores }} />
		</>
	);
}

function SessionScoreStatBreakdown({
	sessionData,
	chartIDs,
	filter,
	view,
	setScores,
}: {
	sessionData: SessionReturns;
	setScores: SetScores;
	chartIDs: string[] | null;
	filter: "folder" | "all" | "highlighted";
	view: "lamps" | "both" | "grades";
}) {
	const songMap = CreateSongMap(sessionData.songs);
	const chartMap = CreateChartMap(sessionData.charts);
	const scoreMap = CreateScoreIDMap(sessionData.scores);

	const [newLamps, newGrades] = useMemo(() => {
		const newLamps: Partial<
			Record<Lamps[IDStrings], { score: ScoreDocument; scoreInfo: SessionScoreInfo }[]>
		> = {};
		const newGrades: Partial<
			Record<Grades[IDStrings], { score: ScoreDocument; scoreInfo: SessionScoreInfo }[]>
		> = {};

		for (const scoreInfo of sessionData.session.scoreInfo) {
			const score = scoreMap.get(scoreInfo.scoreID);

			if (!score) {
				console.error(
					`Session score info contains scoreID ${scoreInfo.scoreID}, but no score exists?`
				);
				continue;
			}

			if (filter === "folder" && chartIDs && !chartIDs.includes(score.chartID)) {
				continue;
			} else if (filter === "highlighted" && !score.highlight) {
				continue;
			}

			if (scoreInfo.isNewScore) {
				PartialArrayRecordAssign(newLamps, score.scoreData.lamp, { score, scoreInfo });
				PartialArrayRecordAssign(newGrades, score.scoreData.grade, { score, scoreInfo });
			} else {
				if (scoreInfo.lampDelta > 0) {
					PartialArrayRecordAssign(newLamps, score.scoreData.lamp, { score, scoreInfo });
				}

				if (scoreInfo.gradeDelta > 0) {
					PartialArrayRecordAssign(newGrades, score.scoreData.grade, {
						score,
						scoreInfo,
					});
				}
			}
		}

		return [newLamps, newGrades];
	}, [chartIDs, filter, view]);

	const gptConfig = GetGamePTConfig(sessionData.session.game, sessionData.session.playtype);

	return (
		<>
			{view === "both" ? (
				<>
					<div className="col-12 col-lg-6">
						<MiniTable
							headers={["Lamp", "New Lamps"]}
							colSpan={[1, 2]}
							className="table-sm"
						>
							<ElementStatTable
								scores={sessionData.scores}
								setScores={setScores}
								chartMap={chartMap}
								songMap={songMap}
								counts={newLamps}
								game={sessionData.session.game}
								type="lamp"
								gptConfig={gptConfig}
							/>
						</MiniTable>
					</div>
					<div className="col-12 col-lg-6">
						<MiniTable
							headers={["Grade", "New Grades"]}
							colSpan={[1, 2]}
							className="table-sm"
						>
							<ElementStatTable
								scores={sessionData.scores}
								setScores={setScores}
								chartMap={chartMap}
								songMap={songMap}
								counts={newGrades}
								game={sessionData.session.game}
								type="grade"
								gptConfig={gptConfig}
							/>
						</MiniTable>
					</div>
				</>
			) : view === "grades" ? (
				<div className="col-12">
					<MiniTable headers={["Grade", "New Grades"]} colSpan={[1, 100]}>
						<ElementStatTable
							scores={sessionData.scores}
							setScores={setScores}
							fullSize
							chartMap={chartMap}
							songMap={songMap}
							counts={newGrades}
							game={sessionData.session.game}
							type="grade"
							gptConfig={gptConfig}
						/>
					</MiniTable>
				</div>
			) : (
				<div className="col-12">
					<MiniTable headers={["Lamps", "New Lamps"]} colSpan={[1, 100]}>
						<ElementStatTable
							scores={sessionData.scores}
							setScores={setScores}
							fullSize
							chartMap={chartMap}
							songMap={songMap}
							counts={newLamps}
							game={sessionData.session.game}
							type="lamp"
							gptConfig={gptConfig}
						/>
					</MiniTable>
				</div>
			)}
		</>
	);
}

function ElementStatTable({
	type,
	counts,
	gptConfig,
	songMap,
	chartMap,
	game,
	fullSize = false,
	scores,
	setScores,
}: {
	type: "lamp" | "grade";
	setScores: SetScores;
	scores: ScoreDocument[];
	counts: Record<string, { score: ScoreDocument; scoreInfo: SessionScoreInfo }[]>;
	gptConfig: GamePTConfig;
	songMap: Map<integer, SongDocument<Game>>;
	chartMap: Map<string, ChartDocument<IDStrings>>;
	game: Game;
	fullSize?: boolean;
}) {
	function makeModifyScoreFn(score: ScoreDocument) {
		return ({ highlight, comment }: { highlight?: boolean; comment?: string | null }) => {
			const scoreID = score.scoreID;

			ModifyScore(scoreID, { highlight, comment }).then((r) => {
				if (r) {
					const filtered = scores.filter((e) => e.scoreID !== scoreID);
					const newScore = { ...score };

					if (highlight !== undefined) {
						newScore.highlight = highlight;
					}
					if (comment !== undefined) {
						newScore.comment = comment;
					}

					setScores([...filtered, newScore]);
				}
			});
		};
	}

	const tableContents = useMemo(() => {
		// relements.. haha
		const relevantElements =
			type === "lamp"
				? gptConfig.lamps.slice(gptConfig.lamps.indexOf(gptConfig.clearLamp) - 1).reverse()
				: gptConfig.grades
						.slice(gptConfig.grades.indexOf(gptConfig.clearGrade) - 1)
						.reverse();

		const colours = type === "lamp" ? gptConfig.lampColours : gptConfig.gradeColours;

		const tableContents = [];
		for (const element of relevantElements) {
			if (!counts[element] || !counts[element].length) {
				continue;
			}

			const firstData = counts[element][0];

			const firstModify = makeModifyScoreFn(firstData.score);

			tableContents.push(
				<tr key={element} className="breakdown-hover-row">
					<td
						style={{
							// @ts-expect-error this is a hack due to the funky type of colours and element.
							backgroundColor: ChangeOpacity(colours[element], 0.1),
						}}
						rowSpan={counts[element]!.length}
					>
						{element}
					</td>
					<BreakdownChartContents
						{...firstData}
						{...{ chartMap, songMap, fullSize, game, gptConfig, type }}
						modifyScore={firstModify}
					/>
				</tr>
			);

			for (const data of counts[element]!.slice(1)) {
				const modifyScore = makeModifyScoreFn(data.score);

				tableContents.push(
					<tr key={data.score.scoreID} className="breakdown-hover-row">
						<BreakdownChartContents
							{...data}
							{...{ chartMap, songMap, fullSize, game, gptConfig, type, modifyScore }}
						/>
					</tr>
				);
			}
		}

		return tableContents;
	}, [type, counts, fullSize, game]);

	if (tableContents.length === 0) {
		return (
			<tr>
				<td colSpan={3}>Nothing...</td>
			</tr>
		);
	}

	return <>{tableContents}</>;
}

function BreakdownChartContents({
	score,
	scoreInfo,
	game,
	songMap,
	chartMap,
	fullSize,
	gptConfig,
	type,
	modifyScore,
}: {
	score: ScoreDocument;
	scoreInfo: SessionScoreInfo;
	fullSize: boolean;
	game: Game;
	songMap: Map<integer, SongDocument>;
	chartMap: Map<string, ChartDocument>;
	gptConfig: GamePTConfig;
	modifyScore: ({ highlight, comment }: { highlight?: boolean; comment?: string | null }) => void;
	type: "lamp" | "grade";
}) {
	const chart = chartMap.get(score.chartID)!;
	const song = songMap.get(score.songID)!;

	const { user } = useContext(UserContext);

	const [highlight, setHighlight] = useState(score.highlight);
	const [comment, setComment] = useState(score.comment);
	const [firstRun, setFirstRun] = useState(true);

	useEffect(() => {
		if (firstRun) {
			setFirstRun(false);
			return;
		}

		modifyScore({ highlight, comment });
	}, [highlight, comment]);

	if (!chart || !song) {
		console.error(`No chart for ${score.chartID}/${score.songID}???`);
		return null;
	}

	if (fullSize) {
		let preScoreCell = <td>No Play</td>;

		if (!scoreInfo.isNewScore) {
			const oldGradeIndex = score.scoreData.gradeIndex - scoreInfo.gradeDelta;
			const oldLampIndex = score.scoreData.lampIndex - scoreInfo.lampDelta;

			const mockScore = deepmerge(score, {
				scoreData: {
					score: score.scoreData.score - scoreInfo.scoreDelta,
					percent: score.scoreData.percent - scoreInfo.percentDelta,
					grade: gptConfig.grades[oldGradeIndex],
					gradeIndex: oldGradeIndex,
					lamp: gptConfig.lamps[oldLampIndex],
					lampIndex: oldLampIndex,
				},
			}) as ScoreDocument;

			if (type === "grade") {
				preScoreCell = <ScoreCell score={mockScore} />;
			} else {
				preScoreCell = <LampCell score={mockScore} />;
			}
		}

		if (score) {
			return (
				<>
					<TitleCell chart={chart} game={game} song={song} />
					<DifficultyCell chart={chart} game={game} />
					{preScoreCell}
					<td>⟶</td>
					{type === "grade" ? (
						<ScoreCell {...{ score, game, playtype: score.playtype }} />
					) : (
						<LampCell score={score} />
					)}
				</>
			);
		}
	}

	return (
		<>
			<TitleCell noArtist chart={chart} game={game} song={song} comment={comment} />
			{score.userID === user?.id && (
				<CommentHighlightManager
					highlight={highlight}
					setHighlight={setHighlight}
					comment={comment}
					setComment={setComment}
				/>
			)}
			<DifficultyCell alwaysShort chart={chart} game={game} />
		</>
	);
}

/**
 * It manages the comment and highlight stuff.
 *
 * I don't know what else to call this function.
 */
function CommentHighlightManager({
	highlight,
	setHighlight,
	comment,
	setComment,
}: {
	highlight: boolean;
	setHighlight: (hl: boolean) => void;
	comment: string | null;
	setComment: (cm: string | null) => void;
}) {
	const [showCommentModal, setShowCommentModal] = useState(false);

	return (
		<td style={{ verticalAlign: "center" }}>
			<CommentModal
				show={showCommentModal}
				setShow={setShowCommentModal}
				initialComment={comment}
				onUpdate={(comment) => {
					setComment(comment);
					setShowCommentModal(false);
				}}
			/>
			<span className="breakdown-hover-highlight-button">
				<Icon
					onClick={() => setShowCommentModal(true)}
					type="comment"
					regular
					style={{ paddingTop: "0.1rem", paddingRight: "0.33rem" }}
				/>
			</span>
			{highlight ? (
				<Icon
					onClick={() => setHighlight(false)}
					colour="warning"
					type="star"
					style={{ paddingTop: "0.1rem", paddingRight: "0.33rem" }}
				/>
			) : (
				<span className="breakdown-hover-highlight-button">
					<Icon
						onClick={() => setHighlight(true)}
						type="star"
						regular
						style={{ paddingTop: "0.1rem" }}
					/>
				</span>
			)}
		</td>
	);
}
