"""
Server-side dashboard image renderer using matplotlib.
Produces a professional, data-driven traffic analytics dashboard
with accurate labels, real numbers, and proper storytelling.
"""

import io
import base64
import matplotlib
matplotlib.use("Agg")  # Non-interactive backend
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.gridspec import GridSpec
import numpy as np


# ── Color Palette ─────────────────────────────────────────────────
BG_DARK   = "#0f1520"
BG_CARD   = "#1a2332"
BG_PANEL  = "#151d2e"
TEXT_WHITE = "#e2e8f0"
TEXT_MUTED = "#94a3b8"
TEXT_DIM   = "#64748b"

KPI_COLORS = ["#4f8ef7", "#34d399", "#a78bfa", "#ef4444", "#eab308"]
CHART_COLORS = [
    "#4f8ef7", "#34d399", "#f59e42", "#ef4444", "#a78bfa",
    "#f472b6", "#06b6d4", "#eab308", "#14b8a6", "#f43f5e",
]

RISK_COLORS = {
    "low":      "#34d399",
    "medium":   "#eab308",
    "high":     "#f97316",
    "critical": "#ef4444",
}

VIOLATION_LABELS = {
    "lane_change": "Lane Change", "wrong_way": "Wrong Way",
    "speeding": "Speeding", "stopped_vehicle": "Stopped",
    "no_helmet": "No Helmet", "excess_riders": "Excess Riders",
    "jaywalking": "Jaywalking", "tailgating": "Tailgating",
    "red_light": "Red Light", "uturn": "U-Turn",
    "accident": "Accident",
}


def _rounded_rect(ax, x, y, w, h, radius=0.02, color=BG_CARD, **kwargs):
    """Draw a rounded rectangle patch."""
    patch = mpatches.FancyBboxPatch(
        (x, y), w, h,
        boxstyle=f"round,pad=0,rounding_size={radius}",
        facecolor=color, edgecolor="none", **kwargs
    )
    ax.add_patch(patch)
    return patch


def render_dashboard_image(
    cumulative: dict,
    violation_counts: dict,
    total_violations: int,
    analysis: dict,
    width: int = 1200,
    height: int = 900,
) -> str:
    """
    Render a professional dashboard image and return base64-encoded PNG.
    """
    fig = plt.figure(figsize=(width / 100, height / 100), dpi=100)
    fig.patch.set_facecolor(BG_DARK)

    # Main grid: 4 rows
    gs = GridSpec(
        4, 2,
        figure=fig,
        hspace=0.35,
        wspace=0.25,
        left=0.06, right=0.94,
        top=0.92, bottom=0.05,
    )

    veh   = cumulative.get("total_vehicles", 0)
    peds  = cumulative.get("total_persons", 0)
    bikes = cumulative.get("total_bikes", 0)
    by_class = cumulative.get("by_class", {})
    risk_level = analysis.get("risk_level", "medium")
    risk_score = analysis.get("risk_score", 0)
    risk_color = RISK_COLORS.get(risk_level, "#eab308")

    # ═══════════════════════════════════════════════════════════════
    # ROW 0: Title + KPI Cards
    # ═══════════════════════════════════════════════════════════════
    ax_title = fig.add_subplot(gs[0, :])
    ax_title.set_xlim(0, 1)
    ax_title.set_ylim(0, 1)
    ax_title.axis("off")

    # Title
    ax_title.text(
        0.0, 0.88, "TRAFFIC ANALYSIS DASHBOARD",
        fontsize=16, fontweight="bold", color=TEXT_WHITE,
        fontfamily="sans-serif", va="top"
    )
    ax_title.text(
        0.0, 0.72, "AI-Powered Analytics & Risk Assessment",
        fontsize=9, color=TEXT_MUTED, va="top"
    )

    # KPI Cards
    kpi_data = [
        ("Vehicles",   veh,              KPI_COLORS[0], "🚗"),
        ("Pedestrians", peds,            KPI_COLORS[1], "🚶"),
        ("Bikes",       bikes,           KPI_COLORS[2], "🏍"),
        ("Violations",  total_violations, KPI_COLORS[3], "⚠"),
        ("Risk Score",  risk_score,       risk_color,    "●"),
    ]

    card_w = 0.175
    gap = 0.02
    start_x = 0.0
    for i, (label, value, color, icon) in enumerate(kpi_data):
        cx = start_x + i * (card_w + gap)
        # Card background
        _rounded_rect(ax_title, cx, 0.0, card_w, 0.58, radius=0.02, color=BG_CARD)
        # Accent left border
        _rounded_rect(ax_title, cx, 0.0, 0.006, 0.58, radius=0.003, color=color)
        # Value
        ax_title.text(
            cx + card_w / 2, 0.38,
            str(value),
            fontsize=18, fontweight="bold", color=color,
            ha="center", va="center"
        )
        # Label
        ax_title.text(
            cx + card_w / 2, 0.1,
            label.upper(),
            fontsize=7, fontweight="bold", color=TEXT_MUTED,
            ha="center", va="center"
        )

    # ═══════════════════════════════════════════════════════════════
    # ROW 1 LEFT: Donut Chart — Violation Distribution
    # ═══════════════════════════════════════════════════════════════
    ax_donut = fig.add_subplot(gs[1, 0])
    ax_donut.set_facecolor(BG_CARD)
    for spine in ax_donut.spines.values():
        spine.set_visible(False)

    sorted_violations = sorted(violation_counts.items(), key=lambda x: x[1], reverse=True)
    if sorted_violations:
        labels = [VIOLATION_LABELS.get(k, k.replace("_", " ").title()) for k, _ in sorted_violations]
        values = [v for _, v in sorted_violations]
        colors = CHART_COLORS[:len(values)]

        wedges, _ = ax_donut.pie(
            values, colors=colors, startangle=90,
            wedgeprops=dict(width=0.38, edgecolor=BG_DARK, linewidth=2),
        )
        # Center text
        ax_donut.text(0, 0.05, str(sum(values)), fontsize=18, fontweight="bold",
                      color=TEXT_WHITE, ha="center", va="center")
        ax_donut.text(0, -0.12, "TOTAL", fontsize=7, color=TEXT_MUTED,
                      ha="center", va="center")

        # Legend below (compact)
        legend_text = "  ".join([f"● {labels[i]}: {values[i]}" for i in range(min(5, len(labels)))])
        ax_donut.set_title("Violation Distribution", fontsize=10, fontweight="bold",
                           color=TEXT_WHITE, loc="left", pad=10)
    else:
        ax_donut.text(0.5, 0.5, "No violations", fontsize=11, color=TEXT_MUTED,
                      ha="center", va="center", transform=ax_donut.transAxes)
        ax_donut.set_title("Violation Distribution", fontsize=10, fontweight="bold",
                           color=TEXT_WHITE, loc="left", pad=10)

    # ═══════════════════════════════════════════════════════════════
    # ROW 1 RIGHT: Horizontal Bar Chart — Vehicle Types
    # ═══════════════════════════════════════════════════════════════
    ax_bar = fig.add_subplot(gs[1, 1])
    ax_bar.set_facecolor(BG_CARD)

    if by_class:
        sorted_classes = sorted(by_class.items(), key=lambda x: x[1], reverse=True)[:6]
        bar_labels = [k.title() for k, _ in sorted_classes]
        bar_values = [v for _, v in sorted_classes]

        y_pos = np.arange(len(bar_labels))
        bars = ax_bar.barh(
            y_pos, bar_values,
            color=[CHART_COLORS[i % len(CHART_COLORS)] for i in range(len(bar_values))],
            height=0.55, edgecolor="none"
        )
        ax_bar.set_yticks(y_pos)
        ax_bar.set_yticklabels(bar_labels, fontsize=9, color=TEXT_WHITE)
        ax_bar.invert_yaxis()

        # Value labels
        for bar, val in zip(bars, bar_values):
            ax_bar.text(bar.get_width() + 0.5, bar.get_y() + bar.get_height() / 2,
                       str(val), fontsize=9, fontweight="bold", color=TEXT_WHITE,
                       va="center")

        ax_bar.set_xlim(0, max(bar_values) * 1.15)
    else:
        ax_bar.text(0.5, 0.5, "No vehicle data", fontsize=11, color=TEXT_MUTED,
                    ha="center", va="center", transform=ax_bar.transAxes)

    ax_bar.set_title("Vehicle Types", fontsize=10, fontweight="bold",
                     color=TEXT_WHITE, loc="left", pad=10)
    ax_bar.tick_params(axis="x", colors=TEXT_DIM, labelsize=8)
    ax_bar.tick_params(axis="y", left=False)
    for spine in ax_bar.spines.values():
        spine.set_visible(False)
    ax_bar.grid(axis="x", color=(1, 1, 1, 0.04), linewidth=0.5)

    # ═══════════════════════════════════════════════════════════════
    # ROW 2: Area/Bar Chart — Violations by Type
    # ═══════════════════════════════════════════════════════════════
    ax_area = fig.add_subplot(gs[2, :])
    ax_area.set_facecolor(BG_CARD)

    if sorted_violations:
        x = np.arange(len(sorted_violations))
        vals = [v for _, v in sorted_violations]
        lbls = [VIOLATION_LABELS.get(k, k.replace("_", " ").title()) for k, _ in sorted_violations]

        # Gradient area fill
        ax_area.fill_between(x, vals, alpha=0.25, color="#4f8ef7")
        ax_area.plot(x, vals, color="#4f8ef7", linewidth=2.5, marker="o",
                    markersize=6, markerfacecolor="#4f8ef7", markeredgecolor=BG_DARK,
                    markeredgewidth=2)

        # Value annotations
        for xi, vi in zip(x, vals):
            ax_area.annotate(
                str(vi), (xi, vi), textcoords="offset points",
                xytext=(0, 10), ha="center", fontsize=8, fontweight="bold",
                color=TEXT_WHITE
            )

        ax_area.set_xticks(x)
        ax_area.set_xticklabels(lbls, fontsize=8, color=TEXT_MUTED, rotation=20, ha="right")
    else:
        ax_area.text(0.5, 0.5, "No violation data", fontsize=11, color=TEXT_MUTED,
                    ha="center", va="center", transform=ax_area.transAxes)

    ax_area.set_title("Violations by Type", fontsize=10, fontweight="bold",
                     color=TEXT_WHITE, loc="left", pad=10)
    ax_area.tick_params(axis="y", colors=TEXT_DIM, labelsize=8)
    ax_area.set_ylim(bottom=0)
    for spine in ax_area.spines.values():
        spine.set_visible(False)
    ax_area.grid(axis="y", color=(1, 1, 1, 0.04), linewidth=0.5)

    # ═══════════════════════════════════════════════════════════════
    # ROW 3: AI Insight Summary Panel
    # ═══════════════════════════════════════════════════════════════
    ax_summary = fig.add_subplot(gs[3, :])
    ax_summary.set_xlim(0, 1)
    ax_summary.set_ylim(0, 1)
    ax_summary.axis("off")
    ax_summary.set_facecolor(BG_CARD)

    # Background
    _rounded_rect(ax_summary, 0, 0, 1, 1, radius=0.04, color=BG_CARD)

    # Risk badge
    risk_label = risk_level.upper()
    import matplotlib.colors as mcolors
    rc = mcolors.to_rgba(risk_color, alpha=0.13)
    _rounded_rect(ax_summary, 0.82, 0.7, 0.16, 0.22, radius=0.03, color=rc)
    ax_summary.text(0.90, 0.81, f"{risk_label} RISK", fontsize=9, fontweight="bold",
                   color=risk_color, ha="center", va="center")

    # Summary text
    summary = analysis.get("summary", "No summary available.")
    # Word-wrap summary
    words = summary.split()
    lines = []
    current = ""
    for w in words:
        if len(current) + len(w) + 1 > 85:
            lines.append(current)
            current = w
        else:
            current = f"{current} {w}" if current else w
    if current:
        lines.append(current)

    ax_summary.text(0.02, 0.88, "[AI] Summary", fontsize=10, fontweight="bold",
                   color=TEXT_WHITE, va="top")

    for i, line in enumerate(lines[:3]):
        ax_summary.text(0.02, 0.68 - i * 0.16, line,
                       fontsize=8, color=TEXT_MUTED, va="top")

    # Insight
    insight = analysis.get("insight", "")
    if insight:
        _rounded_rect(ax_summary, 0.02, 0.02, 0.96, 0.22, radius=0.02,
                      color=(0.92, 0.7, 0.03, 0.07))
        ax_summary.text(0.04, 0.13, f">> {insight}",
                       fontsize=8, color="#eab308", va="center",
                       style="italic")

    # ═══════════════════════════════════════════════════════════════
    # Export to base64 PNG
    # ═══════════════════════════════════════════════════════════════
    buf = io.BytesIO()
    fig.savefig(buf, format="png", facecolor=BG_DARK, bbox_inches="tight", pad_inches=0.2)
    plt.close(fig)
    buf.seek(0)
    return base64.b64encode(buf.read()).decode("utf-8")
