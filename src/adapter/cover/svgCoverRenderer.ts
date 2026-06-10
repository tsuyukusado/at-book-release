import { CoverSpec, calcSpineWidthMm, PAPER_DIMENSIONS_MM } from "../../domain/coverSpec";

const BLEED = 3;  // 塗り足し mm

function r(n: number): number {
    return Math.round(n * 100) / 100;
}

function guideLine(x1: number, y1: number, x2: number, y2: number, color: string, dash: string): string {
    return `  <line x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}" stroke="${color}" stroke-width="0.3" stroke-dasharray="${dash}"/>`;
}

function label(x: number, y: number, text: string, size = 3.5, anchor = "middle"): string {
    return `  <text x="${r(x)}" y="${r(y)}" font-family="sans-serif" font-size="${size}" text-anchor="${anchor}" fill="#555">${text}</text>`;
}

export function renderCoverSvg(spec: CoverSpec): string {
    const { widthMm, heightMm } = PAPER_DIMENSIONS_MM[spec.paperSize];
    const spineWidthMm = Math.round(calcSpineWidthMm(spec) * 100) / 100;

    // キャンバスサイズ = 塗り足し込みの入稿データサイズ
    const canvasW = BLEED + widthMm + spineWidthMm + widthMm + BLEED;
    const canvasH = BLEED + heightMm + BLEED;

    // 各ゾーンの x 境界（塗り足し起点）
    const trimLeft   = BLEED;
    const spineLeft  = BLEED + widthMm;
    const spineRight = BLEED + widthMm + spineWidthMm;
    const trimRight  = BLEED + widthMm + spineWidthMm + widthMm;
    const trimTop    = BLEED;
    const trimBottom = BLEED + heightMm;

    const isRightBinding = spec.writingMode === "vertical";
    const bindingLabel   = isRightBinding ? "右綴じ" : "左綴じ";

    const lines: string[] = [];

    lines.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r(canvasW)} ${r(canvasH)}" width="${r(canvasW)}mm" height="${r(canvasH)}mm">`);

    // 背景（塗り足しを含む全体）
    lines.push(`  <rect width="${r(canvasW)}" height="${r(canvasH)}" fill="#ffe8e8"/>`);

    // 印刷エリア（トリム内）
    lines.push(`  <rect x="${r(trimLeft)}" y="${r(trimTop)}" width="${r(widthMm + spineWidthMm + widthMm)}" height="${r(heightMm)}" fill="#f0f0f0"/>`);

    // 背エリア
    lines.push(`  <rect x="${r(spineLeft)}" y="${r(trimTop)}" width="${r(spineWidthMm)}" height="${r(heightMm)}" fill="#d8d8d8"/>`);

    // トリムライン（仕上がりサイズ）
    lines.push(guideLine(trimLeft,  0,         trimLeft,  canvasH,   "#cc4444", "3,2"));
    lines.push(guideLine(trimRight, 0,         trimRight, canvasH,   "#cc4444", "3,2"));
    lines.push(guideLine(0,         trimTop,   canvasW,   trimTop,   "#cc4444", "3,2"));
    lines.push(guideLine(0,         trimBottom, canvasW,  trimBottom, "#cc4444", "3,2"));

    // 折りガイドライン（背の境界）
    lines.push(guideLine(spineLeft,  0, spineLeft,  canvasH, "#4466cc", "4,2"));
    lines.push(guideLine(spineRight, 0, spineRight, canvasH, "#4466cc", "4,2"));

    // ゾーンラベル（右綴じ=縦書き: 右が表紙 / 左綴じ=横書き: 左が表紙）
    const midY = trimTop + heightMm / 2;
    const leftLabel  = isRightBinding ? "裏表紙" : "表紙";
    const rightLabel = isRightBinding ? "表紙"   : "裏表紙";
    lines.push(label(trimLeft  + widthMm / 2, midY, leftLabel));
    lines.push(label(trimRight - widthMm / 2, midY, rightLabel));

    // 背ラベル（幅が十分あれば）
    if (spineWidthMm >= 5) {
        const spMid = spineLeft + spineWidthMm / 2;
        lines.push(`  <text x="${r(spMid)}" y="${r(midY)}" font-family="sans-serif" font-size="3" text-anchor="middle" fill="#333" transform="rotate(-90,${r(spMid)},${r(midY)})">背 ${spineWidthMm}mm</text>`);
    }

    // 凡例・仕様メモ（裏表紙エリア内、下部）
    const legendX = trimLeft + 4;
    const legendY = trimBottom - 18;
    const lineH   = 6;

    lines.push(guideLine(legendX, legendY + 2, legendX + 8, legendY + 2, "#cc4444", "3,2"));
    lines.push(label(legendX + 10, legendY + 3, "仕上がりライン（断裁位置）", 4, "start"));

    lines.push(guideLine(legendX, legendY + 2 + lineH, legendX + 8, legendY + 2 + lineH, "#4466cc", "4,2"));
    lines.push(label(legendX + 10, legendY + 3 + lineH, "折りライン（背の境界）", 4, "start"));

    lines.push(label(legendX, legendY + 3 + lineH * 2,
        `${spec.paperSize.toUpperCase()} ${bindingLabel} / ${spec.pageCount}p / 本文紙 ${spec.bodyPaperThicknessMm}mm / 表紙紙 ${spec.coverPaperThicknessMm}mm / 背幅 ${spineWidthMm}mm / 塗り足し ${BLEED}mm`,
        3, "start"));

    lines.push(`</svg>`);
    return lines.join("\n");
}
