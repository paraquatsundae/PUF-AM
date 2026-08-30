import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import { JI_HIGH_RISK_THRESHOLD } from './jiBlightBands';
import { seasonMonthsList, type BlightTimeRange } from './blightSeason';
import type { BlightHistoricalStats } from '../hooks/useBlightModelSeries';

type PdfDay = {
  dateStr: string;
  threat: number;
  T: number;
  RH: number;
  WD: number;
  isSprayDay: boolean;
};

export async function exportBlightHistoricalPdf(opts: {
  chartEl: HTMLDivElement;
  farmName: string;
  selectedSeason: string;
  timeRange: BlightTimeRange;
  customStartMonth: number;
  customEndMonth: number;
  historicalStats: BlightHistoricalStats;
  filteredHistoricalData: PdfDay[];
  locationLabel: string;
}): Promise<void> {
  const doc = new jsPDF();
  doc.setFontSize(20);
  doc.setTextColor(15, 23, 42);
  doc.text('Historical Blight Risk Report', 14, 22);
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);
  doc.text(`Farm: ${opts.farmName}`, 14, 35);
  doc.text(`Season: ${opts.selectedSeason}`, 14, 40);
  doc.text(
    `Period: ${
      opts.timeRange === 'Custom'
        ? `${seasonMonthsList[opts.customStartMonth]} - ${seasonMonthsList[opts.customEndMonth]}`
        : `Past ${opts.timeRange}`
    }`,
    14,
    45
  );
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text('Period Summary', 14, 60);
  autoTable(doc, {
    startY: 65,
    head: [['Metric', 'Value']],
    body: [
      [`High index days (> ${JI_HIGH_RISK_THRESHOLD})`, opts.historicalStats.highRiskDays.toString()],
      ['Sprays Applied', opts.historicalStats.totalSprays.toString()],
      ['Average Threat Level', opts.historicalStats.avgThreat],
      ['Location', opts.locationLabel],
    ],
    theme: 'striped',
    headStyles: { fillColor: [16, 185, 129] },
  });
  doc.setFontSize(14);
  doc.text('Risk Breakdown by Growth Stage', 14, 125);
  autoTable(doc, {
    startY: 130,
    head: [['Stage', 'Avg Risk', 'Sprays', 'Critical Days']],
    body: opts.historicalStats.stageBreakdown.map((s) => [
      s.name,
      s.avgThreat,
      s.sprays.toString(),
      s.highRiskDays.toString(),
    ]),
    theme: 'grid',
    headStyles: { fillColor: [59, 130, 246] },
    styles: { fontSize: 9 },
  });
  const canvas = await html2canvas(opts.chartEl, { scale: 2, logging: false, useCORS: true });
  const imgData = canvas.toDataURL('image/png');
  doc.addPage();
  doc.setFontSize(14);
  doc.text('Risk Trend Visualization', 14, 22);
  doc.addImage(imgData, 'PNG', 14, 30, 180, 90);
  const highRiskEvents = opts.filteredHistoricalData
    .filter((d) => d.threat > JI_HIGH_RISK_THRESHOLD)
    .map((d) => [
      d.dateStr,
      d.threat.toFixed(2),
      d.T.toFixed(1) + '°C',
      d.RH.toFixed(0) + '%',
      d.WD.toFixed(1) + 'h',
      d.isSprayDay ? 'YES' : 'NO',
    ]);
  if (highRiskEvents.length > 0) {
    doc.addPage();
    doc.setFontSize(14);
    doc.text('High Risk Events Summary', 14, 22);
    doc.setFontSize(10);
    doc.text(`Detailed data for days where Ji infection index exceeded ${JI_HIGH_RISK_THRESHOLD}.`, 14, 28);
    autoTable(doc, {
      startY: 35,
      head: [['Date', 'Threat', 'Temp', 'RH', 'Wetness', 'Spray']],
      body: highRiskEvents,
      theme: 'grid',
      headStyles: { fillColor: [244, 63, 94] },
      styles: { fontSize: 9 },
    });
  } else {
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`No high-index days (Ji risk > ${JI_HIGH_RISK_THRESHOLD}) in this period.`, 14, 220);
  }
  doc.save(`Blight_Risk_Report_${opts.selectedSeason}_${opts.timeRange}.pdf`);
}
