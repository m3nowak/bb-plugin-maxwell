import { definePluginApp } from '@get-bb/plugin-sdk/app';
import { MaxwellPanel } from './src/MaxwellPanel';
import './src/panel.css';

export default definePluginApp((app) => {
  const panel = {
    id: 'maxwell',
    title: 'maxwell',
    icon: 'maxwell/cat-head' as const,
    layout: 'flush' as const,
    component: MaxwellPanel,
  };
  app.slots.experimental_tab({ ...panel, context: { kind: 'thread' }, availability: 'action' });
  app.slots.experimental_newThreadPanelAction(panel);
});
