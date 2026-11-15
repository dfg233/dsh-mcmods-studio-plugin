package {{package}}.entity;

import net.minecraft.world.entity.SpawnPlacements;
import net.minecraft.world.level.levelgen.Heightmap;

/** {{displayName}} 生成规则；在模组初始化时调用 register()。 */
public final class {{ClassName}}Spawn {
    private {{ClassName}}Spawn() {}

    public static void register() {
        // TODO: SpawnPlacements.register(ModEntities.{{CONST}}.get(), SpawnPlacements.Type.ON_GROUND,
        //     Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, ...);
    }
}
