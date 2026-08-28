import { COMPARE_AXES, type CompareAxisKey } from "@/copy/bundle";
import { PRIORITY_AXES, type ComparePriority } from "./priority";

/**
 * "Help me decide" (improvement 5).
 *
 * The constraint that shapes this entirely: it "must not claim that one item
 * is universally best, and it must not use price or discounts as the primary
 * recommendation logic". So this does not score, rank, or recommend. It reads
 * back what the table already says on the axes the user just said they cared
 * about, side by side, and stops.
 *
 * That sounds thin until you notice what the alternative would be: any ranking
 * function here would be an opinion dressed as arithmetic, built on five
 * synthesised fields, presented to someone who asked for help. Restating the
 * evidence is the honest version of this feature.
 */

export interface DecideColumn {
  key: string;
  label: string;
  isSaved: boolean;
  /** The rendered cell value for each axis, exactly as the table shows it. */
  values: Partial<Record<CompareAxisKey, string>>;
}

export interface TradeOffLine {
  axis: CompareAxisKey;
  axisLabel: string;
  /** One entry per column, in table order, saved item first. */
  readings: { key: string; label: string; value: string; isSaved: boolean }[];
  /**
   * True when every column says the same thing. Worth marking, because an axis
   * that cannot separate the options is not a reason to choose between them --
   * and letting the user see that is more useful than hiding the row.
   */
  undifferentiated: boolean;
}

export function tradeOffs(
  columns: DecideColumn[],
  priority: ComparePriority
): TradeOffLine[] {
  const axes = PRIORITY_AXES[priority];
  return axes.map((axis) => {
    const axisLabel = COMPARE_AXES.find((entry) => entry.key === axis)?.label ?? axis;
    const readings = columns.map((column) => ({
      // Keyed on the column, not the label: two colourways of one product
      // share a label, and keying on it collides.
      key: column.key,
      label: column.label,
      value: column.values[axis] ?? "—",
      isSaved: column.isSaved,
    }));
    const distinct = new Set(readings.map((reading) => reading.value));
    return { axis, axisLabel, readings, undifferentiated: distinct.size <= 1 };
  });
}

/**
 * The closing line. Always present, always the same shape: a reminder that the
 * user chose one lens and the others are still on the table.
 *
 * It deliberately names no option. The moment this sentence can name a winner,
 * the feature has become a recommender built on generated data.
 */
export function tradeOffCaveat(priority: ComparePriority, lines: TradeOffLine[]): string {
  const separating = lines.filter((line) => !line.undifferentiated);
  if (separating.length === 0) {
    return `On ${priority}, these options do not differ. Another priority may separate them.`;
  }
  return `This compares them on ${priority} only. The other rows still apply.`;
}
