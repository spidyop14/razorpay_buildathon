export type Environment="test";
export type PolicyConfig={maximumTransaction:number;maximumDiscountPercent:number;minimumMerchantMargin:number;userApprovalRequired:boolean;maximumPaymentRetries:number;allowedEnvironment:Environment};
export type TransactionProposal={productId:string;basePrice:number;proposedPrice:number;merchantCost:number;environment:Environment|string;paymentAttempt:number;userApproval:boolean};
export type Check={policy:string;status:"passed"|"blocked"|"pending";message:string};
export type PolicyEvaluation={allowed:boolean;requiresUserApproval:boolean;userApproved:boolean;state:"POLICY_BLOCKED"|"AWAITING_USER_APPROVAL"|"APPROVED";blocks:{policy:string;reason:string}[];warnings:string[];checks:Check[];snapshot:PolicyConfig;derived:{discountAmount:number;discountPercent:number;merchantMargin:number}};
