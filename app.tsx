import { definePluginApp } from '@get-bb/plugin-sdk/app';
import { MaxwellOverlay } from './src/MaxwellOverlay';
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
    // A new thread gets a new scene, so no pose or speed carries over.
    component: ({ threadId }) => <MaxwellPanel key={threadId} threadId={threadId} />,
  });
  // Before a thread exists there is no conversation, so Maxwell dances.
  app.slots.experimental_newThreadPanelAction({ ...panel, component: () => <MaxwellPanel /> });
  // One player per BB tab, outliving panels, threads and scenes.
  app.contentScripts.register({ id: 'music', mount: mountMaxwellMusic });
  // One receiver of free and capture per BB tab, and the flying cat when free.
  app.slots.experimental_appOverlay({ id: 'free', component: MaxwellOverlay });
});
