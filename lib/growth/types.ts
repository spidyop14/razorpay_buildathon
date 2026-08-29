import type { Product } from "../catalog";
export type OpportunityType="CROSS_SELL"|"BUNDLE"|"UPSELL"|"HIGH_INTENT"|"INVENTORY_PUSH";
export type OpportunityStatus="PROPOSED"|"MERCHANT_REVIEW"|"MERCHANT_APPROVED"|"DISMISSED";
export type GrowthOpportunity={id:string;type:OpportunityType;title:string;description:string;primaryProduct:Product;relatedProducts:Product[];reason:string;expectedRevenueUplift:number;expectedAOVUplift:number;confidence:number;score:number;status:OpportunityStatus;offer:{subtotal:number;proposedPrice:number;discountAmount:number;discountPercent:number;merchantCost:number;merchantMargin:number}};
