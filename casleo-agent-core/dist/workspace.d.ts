export declare class Workspace {
    readonly root: string;
    private realRoot?;
    constructor(root: string);
    initialize(): Promise<void>;
    resolve(userPath: string, allowMissing?: boolean): Promise<string>;
    relative(absolutePath: string): string;
    private assertLexicallyInside;
    private assertReallyInside;
    private findExistingParent;
}
