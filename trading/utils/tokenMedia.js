"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeVirtualSol = normalizeVirtualSol;
exports.bondingCurvePercentFromSol = bondingCurvePercentFromSol;
exports.marketCapUsdFromSol = marketCapUsdFromSol;
exports.resolveTokenImageCandidates = resolveTokenImageCandidates;
exports.resolveTokenImage = resolveTokenImage;
exports.normalizeIpfsUrl = normalizeIpfsUrl;
exports.isLikelyMetadataUri = isLikelyMetadataUri;
const SOL_USD_ESTIMATE = 200;
const BONDING_TARGET_SOL = 85;
function normalizeVirtualSol(value) {
    if (!Number.isFinite(value) || value <= 0)
        return 0;
    if (value > 1_000_000)
        return value / 1e9;
    return value;
}
function bondingCurvePercentFromSol(virtualSol) {
    const sol = normalizeVirtualSol(virtualSol);
    if (sol <= 0)
        return 0;
    return Math.min(99, Math.round((sol / BONDING_TARGET_SOL) * 100));
}
function marketCapUsdFromSol(marketCapSol) {
    const sol = normalizeVirtualSol(marketCapSol);
    return sol * SOL_USD_ESTIMATE;
}
function resolveTokenImageCandidates(mint, fields) {
    const out = [];
    const push = (u) => {
        if (!u || out.includes(u))
            return;
        out.push(u);
    };
    push(fields?.image);
    push(fields?.imageUri);
    const uri = fields?.uri;
    if (uri) {
        push(normalizeIpfsUrl(uri));
    }
    push(`https://dd.dexscreener.com/ds-data/tokens/solana/${mint}.png`);
    push(`https://imagedelivery.net/WL1JOIJiM_NAChp6rtB6Q/coin-image/${mint}/600x600`);
    push(`https://pump.fun/coin/${mint}.png`);
    push(`https://pump.fun/coin/${mint}/image`);
    return out;
}
function resolveTokenImage(mint, fields) {
    return resolveTokenImageCandidates(mint, fields)[0];
}
function normalizeIpfsUrl(uri) {
    const trimmed = uri.trim();
    if (trimmed.startsWith('ipfs://')) {
        return `https://ipfs.io/ipfs/${trimmed.slice(7)}`;
    }
    if (trimmed.startsWith('Qm') || trimmed.startsWith('bafy')) {
        return `https://ipfs.io/ipfs/${trimmed}`;
    }
    return trimmed;
}
function isLikelyMetadataUri(url) {
    return /\.(json)(\?|$)/i.test(url) || url.includes('metadata');
}
//# sourceMappingURL=tokenMedia.js.map