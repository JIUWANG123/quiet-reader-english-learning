export class RuntimeRegistry{
 private active=new Map<string,string>();private stale=new Map<string,string>();
 activate(namespace:string,token:string){this.active.set(namespace,token);this.stale.delete(namespace);}
 retire(namespace:string,token:string){if(this.active.get(namespace)!==token)return;this.active.delete(namespace);this.stale.set(namespace,token);}
 canDelete(namespace:string,expectedToken:string,recordedToken:string){return !this.active.has(namespace)&&(this.stale.get(namespace)===undefined||this.stale.get(namespace)===expectedToken)&&recordedToken===expectedToken;}
 isActive(namespace:string,token:string){return this.active.get(namespace)===token;}
 hasActiveNamespace(namespace:string){return this.active.has(namespace);}
}
