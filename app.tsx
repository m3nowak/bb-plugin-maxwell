import { definePluginApp } from '@get-bb/plugin-sdk/app';
import { MaxwellPanel } from './src/MaxwellPanel';
import { mountMaxwellMusic } from './src/music';
import './src/panel.css';

export default definePluginApp((app) => {
  const panel = {
    id: 'maxwell',
    title: 'maxwell',
    icon: 'maxwell/cat-head' as const,
    layout: 'flush' as const,
  };
  app.slots.experimental_tab({
    ...panel,
    context: { kind: 'thread' },
    availability: 'action',
    // A new thread gets a new scene, so no angle or speed carries over.
    component: ({ threadId }) => <MaxwellPanel key={threadId} threadId={threadId} />,
  });
  // Before a thread exists there is no saved speed to follow.
  app.slots.experimental_newThreadPanelAction({ ...panel, component: () => <MaxwellPanel /> });
  // One player per BB tab, outliving panels, threads and scenes.
  app.contentScripts.register({ id: 'music', mount: mountMaxwellMusic });
});
