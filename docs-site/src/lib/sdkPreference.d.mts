export type SdkName='typescript'|'go';
export declare const SDK_STORAGE_KEY:string;
export declare const isSdkName:(value:unknown)=>value is SdkName;
export declare const resolveSdkPreference:(query:unknown,stored:unknown)=>SdkName;
