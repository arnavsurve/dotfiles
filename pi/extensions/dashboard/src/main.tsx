import { BrowserRouter, Route, Routes } from "react-router";
import { createRoot } from "react-dom/client";
import { Overview } from "./pages/overview";
import { WorktreeDetail } from "./pages/worktree";
import { SSEProvider } from "./lib/sse";
import "./index.css";

createRoot(document.getElementById("root")!).render(
	<BrowserRouter>
		<SSEProvider>
			<Routes>
				<Route path="/" element={<Overview />} />
				<Route path="/worktree/*" element={<WorktreeDetail />} />
			</Routes>
		</SSEProvider>
	</BrowserRouter>,
);
