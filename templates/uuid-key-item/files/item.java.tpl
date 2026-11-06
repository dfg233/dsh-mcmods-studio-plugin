package {{package}}.item;

import java.util.List;
import java.util.UUID;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.level.Level;
import org.jetbrains.annotations.Nullable;

/** {{displayName}}：带 UUID 绑定的钥匙。 */
public class {{ClassName}}Item extends Item {
    public {{ClassName}}Item() {
        super(new Item.Properties().stacksTo(1));
    }

    @Override
    public void appendHoverText(ItemStack stack, @Nullable Level level, List<Component> tooltip, TooltipFlag flag) {
        UUID key = {{ClassName}}Data.getKey(stack);
        tooltip.add(Component.literal(key == null ? "未绑定" : key.toString()));
    }
}
