import type { BbPluginApi } from '@get-bb/plugin-sdk';
import { serveMaxwellMusic } from './src/musicRoute';

export default function maxwell(bb: BbPluginApi) {
  serveMaxwellMusic(bb);
}
