package {{package}}.multiblock;

import net.minecraft.core.BlockPos;
import net.minecraft.world.level.Level;

/** {{displayName}} 多方块骨架；在方块事件里检测结构并触发。 */
public final class {{ClassName}}Multiblock {
    private {{ClassName}}Multiblock() {}

    public static boolean isFormed(Level level, BlockPos center) {
        // TODO: 检查 {{width}}x{{height}}x{{depth}} 范围内的方块。
        return false;
    }

    public static void onFormed(Level level, BlockPos center) {
        // TODO: 触发效果。
    }
}
