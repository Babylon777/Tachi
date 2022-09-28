import { FlattenValue, StringifyKeyChain } from "util/misc";
import React from "react";

export default function ObjCell({ data }: { data: unknown }) {
	return (
		<td className="text-left">
			{/* this kinda sucks. have we got a better way to do this? */}
			{FlattenValue(data)
				.filter((e) => e.value !== null)
				.map((e) => (
					<>
						<code>{StringifyKeyChain(e.keychain)}</code>: {JSON.stringify(e.value)}
						<br />
					</>
				))}
		</td>
	);
}
