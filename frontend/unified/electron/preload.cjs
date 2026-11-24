'use strict';

const { contextBridge } = require('electron');

// Non-sensitive desktop indicator used by the router to keep the SPA on
// `/terminal`. It exposes no privileged APIs to the renderer.
contextBridge.exposeInMainWorld(
  'cafeteriaDesktop',
  Object.freeze({ terminalOnly: true }),
);
