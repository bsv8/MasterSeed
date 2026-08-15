export const SDK_STORAGE_KEY='masterseed-sdk';
export const isSdkName=value=>value==='typescript'||value==='go';
export const resolveSdkPreference=(query,stored)=>isSdkName(query)?query:isSdkName(stored)?stored:'typescript';
