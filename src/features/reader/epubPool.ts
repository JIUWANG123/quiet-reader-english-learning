import type {Location} from '@epubjs-react-native/core';
export type EpubDocument={id:string;anchor:string|null;direction:-1|0|1;revision?:number;visualAnchor?:Location;location?:Location;boundary?:boolean;retries?:number};
export type EpubPool={current:EpubDocument;serial:number};
export function createEpubPool(anchor:string|null,serial=0):EpubPool{return{current:{id:String(serial),anchor,direction:0},serial:serial+1};}

