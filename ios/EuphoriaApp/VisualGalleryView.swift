import SwiftUI
import Charts

struct VisualGalleryView: View {
    let gallery: VisualGallery
    @State private var sortColumn: Int?
    @State private var ascending = true
    var body: some View {
        switch gallery.kind {
        case .record:
            if let status = gallery.status { Text(status).font(.caption).foregroundStyle(color(gallery.tone)) }
            ForEach(Array((gallery.fields ?? []).enumerated()), id: \.offset) { _, field in
                LabeledContent(field.label) { Text(field.value).textSelection(.enabled) }
            }
        case .metrics:
            LazyVGrid(columns: [GridItem(.flexible()),GridItem(.flexible())], alignment: .leading, spacing: 16) {
                ForEach(Array((gallery.metrics ?? []).enumerated()), id: \.offset) { _, metric in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(metric.label).font(.caption).foregroundStyle(.secondary)
                        Text(metric.value).font(.title2).monospacedDigit()
                        if let change = metric.change { Text(change).font(.caption).foregroundStyle(color(metric.changeTone)) }
                    }
                }
            }
        case .notice:
            Text(gallery.body ?? "").foregroundStyle(color(gallery.tone))
            ForEach(Array((gallery.bullets ?? []).enumerated()), id: \.offset) { _, text in Text("• " + text).font(.subheadline) }
        case .table: table
        case .bar, .pie: pointChart
        case .line, .area: lineChart
        case .progress:
            if (gallery.points ?? []).isEmpty { Text("There is no data to chart.").foregroundStyle(.secondary) }
            ForEach(Array((gallery.points ?? []).enumerated()), id: \.offset) { _, point in
                VStack(alignment: .leading) {
                    HStack { Text(point.label); Spacer(); Text(point.value.formatted() + " / " + (point.target ?? 0).formatted()).monospacedDigit() }
                    ProgressView(value: point.target.map { $0 > 0 ? min(1,max(0,point.value / $0)) : 0 } ?? 0)
                }
            }
        }
    }
    private var table: some View {
        ScrollView(.horizontal) {
            Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 12) {
                GridRow {
                    ForEach(Array((gallery.columns ?? []).enumerated()), id: \.offset) { index, column in
                        Button {
                            if sortColumn == index { ascending.toggle() } else { sortColumn = index; ascending = true }
                        } label: {
                            HStack { Text(column); if sortColumn == index { Image(systemName: ascending ? "chevron.up" : "chevron.down") } }
                                .frame(width: 130, alignment: .leading)
                        }
                    }
                }
                ForEach(gallery.orderedRows(column: sortColumn, ascending: ascending)) { row in
                    GridRow {
                        ForEach(Array(row.cells.enumerated()), id: \.offset) { _, cell in
                            Text(cell.displayText).frame(width: 130, alignment: .leading).textSelection(.enabled)
                        }
                    }
                }
            }
        }
        .overlay { if gallery.rows?.isEmpty == true { Text("There are no rows.").foregroundStyle(.secondary).padding() } }
    }
    @ViewBuilder private var pointChart: some View {
        let points = gallery.points ?? []
        if points.isEmpty || (gallery.kind == .pie && !points.contains(where: { $0.value > 0 })) {
            Text("There is no data to chart.").foregroundStyle(.secondary)
        } else {
            Chart {
                ForEach(Array(points.enumerated()), id: \.offset) { index, point in
                    if gallery.kind == .pie {
                        SectorMark(angle: .value("Value", point.value), innerRadius: .ratio(0.62))
                            .foregroundStyle(by: .value("Label", point.label))
                    } else {
                        BarMark(x: .value("Position", index), y: .value("Value", point.value))
                            .foregroundStyle(by: .value("Label", point.label))
                    }
                }
            }
            .frame(height: 180)
            .chartXAxis {
                AxisMarks(values: Array(points.indices)) { axis in
                    AxisValueLabel { if let index = axis.as(Int.self), points.indices.contains(index) { Text(points[index].label) } }
                }
            }
        }
    }
    @ViewBuilder private var lineChart: some View {
        let labels = gallery.labels ?? [], series = gallery.series ?? []
        if labels.isEmpty || series.isEmpty { Text("There is no data to chart.").foregroundStyle(.secondary) }
        else {
            Chart {
                ForEach(Array(series.enumerated()), id: \.offset) { _, line in
                    ForEach(Array(line.values.enumerated()), id: \.offset) { index, value in
                        if gallery.kind == .area {
                            AreaMark(x: .value("Position", index), y: .value("Value", value), stacking: .unstacked)
                                .foregroundStyle(by: .value("Series", line.name)).opacity(0.18)
                        }
                        LineMark(x: .value("Position", index), y: .value("Value", value))
                            .foregroundStyle(by: .value("Series", line.name))
                    }
                }
            }
            .frame(height: 180)
            .chartXAxis {
                AxisMarks(values: Array(labels.indices)) { axis in
                    AxisValueLabel { if let index = axis.as(Int.self), labels.indices.contains(index) { Text(labels[index]) } }
                }
            }
        }
    }
    private func color(_ tone: VisualTone?) -> Color {
        switch tone { case .positive: return .green; case .caution: return .orange; case .negative: return .red; default: return .primary }
    }
}
