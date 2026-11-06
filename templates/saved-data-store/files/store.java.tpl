package {{package}}.data;

import net.minecraft.server.level.ServerLevel;

/** {{ClassName}} 数据的获取入口。 */
public final class {{ClassName}}Store {
    private {{ClassName}}Store() {}

    public static {{ClassName}}SavedData get(ServerLevel level) {
        return {{ClassName}}SavedData.get(level);
    }
}
