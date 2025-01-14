import { APIFetchV1 } from "util/api";
import { CreateChartMap, CreateScoreIDMap, CreateSongMap } from "util/data";
import useSetSubheader from "components/layout/header/useSetSubheader";
import Card from "components/layout/page/Card";
import SessionOverview from "components/sessions/SessionOverview";
import ScoreTable from "components/tables/scores/ScoreTable";
import ApiError from "components/util/ApiError";
import DebugContent from "components/util/DebugContent";
import Divider from "components/util/Divider";
import EditableText from "components/util/EditableText";
import Icon from "components/util/Icon";
import Loading from "components/util/Loading";
import SelectButton from "components/util/SelectButton";
import useApiQuery from "components/util/query/useApiQuery";
import { UserContext } from "context/UserContext";
import { UserSettingsContext } from "context/UserSettingsContext";
import React, { useContext, useMemo, useState } from "react";
import { Badge, Button, Col, Row } from "react-bootstrap";
import { Redirect, useParams } from "react-router-dom";
import { GetGameConfig } from "tachi-common";
import { SessionReturns } from "types/api-returns";
import { UGPT } from "types/react";

export default function SpecificSessionPage({ reqUser, game, playtype }: UGPT) {
	const { sessionID } = useParams<{ sessionID: string }>();

	const { data, error } = useApiQuery<SessionReturns>(`/sessions/${sessionID}`);

	if (error) {
		return <ApiError error={error} />;
	}

	if (!data) {
		return <Loading />;
	}

	if (
		data.user.id !== reqUser.id ||
		game !== data.session.game ||
		playtype !== data.session.playtype
	) {
		return (
			<Redirect
				to={`/u/${data.user.username}/games/${data.session.game}/${data.session.playtype}/sessions/${sessionID}`}
			/>
		);
	}

	return <SessionPage {...{ data, game, playtype, reqUser }} />;
}

function SessionPage({ data, game, playtype }: UGPT & { data: SessionReturns }) {
	const { settings } = useContext(UserSettingsContext);
	const [sessionData, setSessionData] = useState(data);
	const { session, user, charts, scores, songs } = sessionData;

	const { user: loggedInUser } = useContext(UserContext);

	useSetSubheader(
		[
			"Users",
			user.username,
			"Games",
			GetGameConfig(game).name,
			playtype,
			"Sessions",
			session.name,
		],
		[session.name, game, playtype, user],
		`${user.username}: ${session.name}`
	);

	const [view, setView] = useState<"overview" | "scores">("overview");

	const songMap = CreateSongMap(songs);
	const chartMap = CreateChartMap(charts);
	const scoreMap = CreateScoreIDMap(scores);

	const scoreDataset = useMemo(() => {
		const d = [];

		for (const sci of data.scoreInfo) {
			const score = scoreMap.get(sci.scoreID);

			if (!score) {
				console.error(`No score for scoreID ${sci.scoreID}, but one was in session?`);
				continue;
			}

			const chart = chartMap.get(score.chartID);
			const song = songMap.get(score.songID);

			if (!chart || !song) {
				console.error(`No chart for ${score.chartID} (${score.songID})?`);
				continue;
			}

			d.push({
				...score,
				__related: {
					chart,
					song,
					index: 0,
					user,
				},
			});
		}

		return d;
	}, [sessionData]);

	const [highlight, setHighlight] = useState(session.highlight);

	const updateSession = (sessionData: SessionReturns) => {
		APIFetchV1(
			`/sessions/${sessionData.session.sessionID}`,
			{
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					name: sessionData.session.name,
					desc: sessionData.session.desc,
					highlight: sessionData.session.highlight,
				}),
			},
			true,
			true
		);
	};

	return (
		<Row className="justify-content-center">
			<Col xs={12} className="text-center">
				<div
					className="d-flex flex-wrap justify-content-center align-items-center"
					style={{ flexDirection: "column" }}
				>
					<EditableText
						initial={session.name}
						onChange={(name) => {
							const newSession: SessionReturns = {
								...sessionData,
								session: {
									...sessionData.session,
									name,
								},
							};

							setSessionData(newSession);

							updateSession(newSession);
						}}
					>
						{(text) => (
							<div className="mb-4">
								<span className="display-4">{text}</span>
								<span className="ml-2 text-hover-white">
									<Icon type="pencil-alt" />
								</span>
							</div>
						)}
					</EditableText>

					<EditableText
						initial={session.desc ?? "No Description..."}
						onChange={(desc) => {
							const newSession: SessionReturns = {
								...sessionData,
								session: {
									...sessionData.session,
									desc,
								},
							};

							setSessionData(newSession);

							updateSession(newSession);
						}}
					>
						{(text) => (
							<div className="mb-4">
								<span className="text-muted mb-4">{text}</span>

								<span className="ml-2 text-hover-white">
									<Icon type="pencil-alt" />
								</span>
							</div>
						)}
					</EditableText>
				</div>
				{session.highlight && (
					<Badge
						style={{
							lineHeight: "15px",
						}}
						variant="warning"
						className="ml-2"
					>
						Highlight!
					</Badge>
				)}

				<Divider className="mt-8 mb-4" />
				{user.id === loggedInUser?.id && (
					<>
						{highlight ? (
							<Button
								variant="outline-danger"
								onClick={async () => {
									setHighlight(false);
									session.highlight = false;

									await APIFetchV1(
										`/sessions/${session.sessionID}`,
										{
											method: "PATCH",
											headers: {
												"Content-Type": "application/json",
											},
											body: JSON.stringify({
												highlight: false,
											}),
										},
										true,
										true
									);
								}}
							>
								Un-Highlight Session
							</Button>
						) : (
							<Button
								variant="outline-warning"
								onClick={async () => {
									setHighlight(true);
									session.highlight = true;

									await APIFetchV1(
										`/sessions/${session.sessionID}`,
										{
											method: "PATCH",
											headers: {
												"Content-Type": "application/json",
											},
											body: JSON.stringify({
												highlight: true,
											}),
										},
										true,
										true
									);
								}}
							>
								Highlight Session
							</Button>
						)}
						<Divider />
					</>
				)}
				<div className="btn-group">
					<SelectButton value={view} setValue={setView} id="overview">
						<Icon type="chart-area" />
						Overview
					</SelectButton>
					<SelectButton value={view} setValue={setView} id="scores">
						<Icon type="table" />
						All Scores
					</SelectButton>
				</div>
				<Divider />
			</Col>
			{view === "overview" ? (
				<SessionOverview
					scoreDataset={scoreDataset}
					sessionData={sessionData}
					setSessionData={setSessionData}
				/>
			) : (
				<Col xs={12}>
					<ScoreTable
						dataset={scoreDataset}
						game={session.game}
						playtype={session.playtype}
					/>
				</Col>
			)}
			{settings?.preferences.developerMode && (
				<Col xs={12}>
					<Divider />
					<Card header="Debug Content">
						<DebugContent data={sessionData} />
					</Card>
				</Col>
			)}
		</Row>
	);
}
