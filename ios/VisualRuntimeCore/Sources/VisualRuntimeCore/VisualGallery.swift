import Foundation

public enum VisualTone: String, Codable, Sendable { case neutral, positive, caution, negative }
public enum VisualGalleryKind: String, Codable, Sendable { case record, metrics, notice, table, bar, pie, line, area, progress }
public struct VisualRecordField: Codable, Equatable, Sendable { public let label: String; public let value: String }
public struct VisualMetric: Codable, Equatable, Sendable {
    public let label: String; public let value: String; public let change: String?; public let changeTone: VisualTone?
}
public struct VisualChartPoint: Codable, Equatable, Sendable { public let label: String; public let value: Double; public let target: Double? }
public struct VisualChartSeries: Codable, Equatable, Sendable { public let name: String; public let values: [Double] }
public struct VisualTableRow: Codable, Equatable, Sendable { public let cells: [VisualScalar] }
public struct VisualOrderedRow: Identifiable, Sendable { public let id: Int; public let cells: [VisualScalar] }

/// Source-derived authored gallery data; no executable layout or script enters native components.
public struct VisualGallery: Codable, Equatable, Sendable {
    public let kind: VisualGalleryKind
    public let fields: [VisualRecordField]?
    public let metrics: [VisualMetric]?
    public let status: String?
    public let tone: VisualTone?
    public let body: String?
    public let bullets: [String]?
    public let columns: [String]?
    public let rows: [VisualTableRow]?
    public let points: [VisualChartPoint]?
    public let labels: [String]?
    public let series: [VisualChartSeries]?
    public func validate() throws {
        func require(_ condition: Bool) throws { if !condition { throw VisualContractError.invalidNode } }
        func text(_ s: String, _ max: Int) -> Bool { s.count <= max }
        switch kind {
        case .record:
            try require(fields != nil && fields!.count <= 50 && fields!.allSatisfy { text($0.label,100) && text($0.value,2000) })
            try require(status.map { text($0,100) } ?? true)
        case .metrics:
            try require(metrics != nil && metrics!.count <= 6 && metrics!.allSatisfy { text($0.label,100) && text($0.value,2000) && ($0.change.map { text($0,200) } ?? true) })
        case .notice:
            try require(body != nil && text(body!,4000) && (bullets?.count ?? 0) <= 20 && (bullets?.allSatisfy { text($0,1000) } ?? true))
        case .table:
            try require(columns != nil && (1...8).contains(columns!.count) && Set(columns!).count == columns!.count && columns!.allSatisfy { !$0.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty && text($0,80) })
            try require(rows != nil && rows!.count <= 100 && rows!.allSatisfy { row in
                row.cells.count == columns!.count && row.cells.allSatisfy { cell in
                    switch cell { case .text(let x): return text(x,2000); case .number(let x): return x.isFinite; case .flag: return false }
                }
            })
        case .bar, .pie, .progress:
            try require(points != nil && points!.count <= 100 && points!.allSatisfy { text($0.label,120) && $0.value.isFinite && ($0.target?.isFinite ?? true) })
            if kind == .pie { try require(points!.allSatisfy { $0.value >= 0 }) }
            if kind == .progress { try require(points!.allSatisfy { $0.target != nil }) }
        case .line, .area:
            try require(labels != nil && labels!.count <= 100 && labels!.allSatisfy { text($0,120) })
            try require(series != nil && series!.count <= 8 && Set(series!.map(\.name)).count == series!.count && series!.allSatisfy { text($0.name,120) && $0.values.count == labels!.count && $0.values.allSatisfy(\.isFinite) })
        }
    }
    public func orderedRows(column: Int?, ascending: Bool) -> [VisualOrderedRow] {
        let indexed = (rows ?? []).enumerated().map { VisualOrderedRow(id:$0.offset,cells:$0.element.cells) }
        guard let column, column >= 0, column < (columns?.count ?? 0) else { return indexed }
        return indexed.sorted { a,b in
            let order: ComparisonResult
            switch (a.cells[column], b.cells[column]) {
            case (.number(let x), .number(let y)): order = x == y ? .orderedSame : x < y ? .orderedAscending : .orderedDescending
            default: order = a.cells[column].displayText.localizedStandardCompare(b.cells[column].displayText)
            }
            if order == .orderedSame { return a.id < b.id }
            return ascending ? order == .orderedAscending : order == .orderedDescending
        }
    }
}
public extension VisualScalar {
    var displayText: String {
        switch self { case .text(let s): return s; case .number(let n): return n.formatted(); case .flag(let x): return x ? "Yes" : "No" }
    }
}
