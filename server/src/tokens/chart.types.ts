export interface ChartPoint {
  t: number
  price: number
  volume: number
  curve: number
}

export interface TokenChartSeries {
  mint: string
  points: ChartPoint[]
}
