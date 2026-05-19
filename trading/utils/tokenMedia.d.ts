export declare function normalizeVirtualSol(value: number): number;
export declare function bondingCurvePercentFromSol(virtualSol: number): number;
export declare function marketCapUsdFromSol(marketCapSol: number): number;
export declare function resolveTokenImageCandidates(mint: string, fields?: {
    uri?: string;
    image?: string;
    imageUri?: string;
}): string[];
export declare function resolveTokenImage(mint: string, fields?: {
    uri?: string;
    image?: string;
    imageUri?: string;
}): string;
export declare function normalizeIpfsUrl(uri: string): string;
export declare function isLikelyMetadataUri(url: string): boolean;
