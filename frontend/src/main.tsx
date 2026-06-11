import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Chart,
  LineElement,
  BarElement,
  PointElement,
  LineController,
  BarController,
  CategoryScale,
  LinearScale,
  TimeScale,
  Filler,
  Tooltip,
  Decimation,
} from 'chart.js'
import zoomPlugin from 'chartjs-plugin-zoom'
import 'chartjs-adapter-date-fns'
import './index.css'
import App from './App.tsx'

Chart.register(
  LineElement,
  BarElement,
  PointElement,
  LineController,
  BarController,
  CategoryScale,
  LinearScale,
  TimeScale,
  Filler,
  Tooltip,
  Decimation,
  zoomPlugin
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
