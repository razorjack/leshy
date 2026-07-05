import { mount } from "svelte";
import "./app.css";
import App from "./App.svelte";
import { initTheme } from "./lib/theme.ts";

// Before mount so the theme class is set before the app renders (no flash).
initTheme();

const app = mount(App, { target: document.getElementById("app")! });

export default app;
