import type { Preview } from '@storybook/nextjs';
import '../src/app/globals.css';

const preview: Preview = {
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'app',
      values: [
        { name: 'app', value: '#F1EFEE' },
        { name: 'customer', value: '#FFF5E5' },
        { name: 'surface', value: '#FFFFFF' }
      ]
    },
    viewport: {
      defaultViewport: 'phone',
      viewports: {
        phone: { name: 'Kitchen phone', styles: { width: '390px', height: '844px' } },
        tablet: { name: 'Counter tablet', styles: { width: '834px', height: '1112px' } }
      }
    }
  }
};

export default preview;
