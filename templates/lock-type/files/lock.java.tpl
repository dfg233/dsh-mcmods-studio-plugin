package {{package}}.lock;

/**
 * {{displayName}} 锁类型骨架。
 *
 * 任务：按项目中的 AbstractLock / 锁类型基类补齐构造与抽象方法，
 * 并在注册表里登记新的锁类型 id。
 */
public class {{ClassName}}Lock {
    public static final String TYPE_ID = "{{id}}";

    public {{ClassName}}Lock() {
        // TODO: 调用父类构造并绑定 TYPE_ID
    }
}
