import { mount } from "svelte";
import App from "./App.svelte";
import { lang } from "./lib/i18n.ts";

document.documentElement.lang = lang;

mount(App, { target: document.getElementById("app")! });
