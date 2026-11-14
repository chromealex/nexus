#import <Foundation/Foundation.h>
#import <Security/Security.h>

// Secrets cross this bridge in memory only; never in argv, JSON stores or logs.
static NSDictionary *query(const char *account) {
    return @{(__bridge id)kSecClass:(__bridge id)kSecClassGenericPassword,
             (__bridge id)kSecAttrService:@"com.nexus.connections",
             (__bridge id)kSecAttrAccount:[NSString stringWithUTF8String:account]};
}
int nexus_secret_set(const char *account, const char *secret) {
    @autoreleasepool {
        NSDictionary *q=query(account);
        NSData *data=[[NSString stringWithUTF8String:secret] dataUsingEncoding:NSUTF8StringEncoding];
        OSStatus s=SecItemUpdate((__bridge CFDictionaryRef)q,(__bridge CFDictionaryRef)@{(__bridge id)kSecValueData:data});
        if(s==errSecItemNotFound){NSMutableDictionary *item=[q mutableCopy];item[(__bridge id)kSecValueData]=data;s=SecItemAdd((__bridge CFDictionaryRef)item,NULL);}
        return (int)s;
    }
}
char *nexus_secret_get(const char *account) {
    @autoreleasepool {
        NSMutableDictionary *q=[query(account) mutableCopy];q[(__bridge id)kSecReturnData]=@YES;
        CFTypeRef result=NULL;
        if(SecItemCopyMatching((__bridge CFDictionaryRef)q,&result)!=errSecSuccess)return NULL;
        NSData *data=CFBridgingRelease(result);
        NSString *s=[[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
        return s?strdup([s UTF8String]):NULL;
    }
}
int nexus_secret_delete(const char *account){OSStatus s=SecItemDelete((__bridge CFDictionaryRef)query(account));return s==errSecItemNotFound?0:(int)s;}
void nexus_secret_free(char *value){free(value);}
