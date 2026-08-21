/**
 * Client entry point.
 *
 * TanStack Start used to own both entries — it rendered the document on the
 * server and hydrated it here. With Laravel serving the API there is no Node
 * server to render on, so this mounts the router into the #root element in
 * index.html and that is the whole bootstrap.
 *
 * styles.css is imported rather than linked: the Tailwind Vite plugin needs to
 * see it in the module graph to generate utilities, and it used to reach it
 * through the `?url` import in __root.tsx.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";

import { getRouter } from "./router";
import "./styles.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error('index.html is missing <div id="root">');

const router = getRouter();

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
