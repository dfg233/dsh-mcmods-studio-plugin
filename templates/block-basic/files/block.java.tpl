package {{package}}.block;

import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.material.MapColor;

/** {{displayName}}（{{id}}）。 */
public class {{ClassName}} extends Block {
    public {{ClassName}}() {
        super(Properties.of().mapColor(MapColor.STONE).strength({{hardness}}f, {{resistance}}f).sound(SoundType.STONE));
    }
}
