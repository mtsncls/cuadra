import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

// Note: StrictMode intentionally omitted — its double-mount tears down the
// collaboration WebSocket provider before the connection is established.
createRoot(document.getElementById("root")!).render(<App />);
