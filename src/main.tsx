import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/global.css";

// Recover from macOS killing the WebView content process during App Nap.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    const root = document.getElementById("root");
    if (root && !root.children.length) {
      window.location.reload();
    }
  }
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
