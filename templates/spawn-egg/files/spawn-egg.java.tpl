package {{package}}.item;

import java.util.function.Supplier;

import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.item.Item;
import net.minecraftforge.common.ForgeSpawnEggItem;

/** {{displayName}} 刷怪蛋。 */
public final class {{ClassName}}SpawnEgg {
    private {{ClassName}}SpawnEgg() {}

    public static ForgeSpawnEggItem create(Supplier<EntityType<? extends Mob>> type) {
        return new ForgeSpawnEggItem(type, 0x{{primaryColor}}, 0x{{secondaryColor}}, new Item.Properties());
    }
}
