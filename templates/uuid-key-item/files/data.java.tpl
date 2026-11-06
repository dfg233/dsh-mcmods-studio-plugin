package {{package}}.item;

import java.util.UUID;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.world.item.ItemStack;

/** {{ClassName}} 的 NBT 读写。 */
public final class {{ClassName}}Data {
    private static final String KEY_TAG = "key";

    private {{ClassName}}Data() {}

    public static UUID getKey(ItemStack stack) {
        CompoundTag tag = stack.getTag();
        return tag != null && tag.hasUUID(KEY_TAG) ? tag.getUUID(KEY_TAG) : null;
    }

    public static void setKey(ItemStack stack, UUID key) {
        CompoundTag tag = stack.getOrCreateTag();
        tag.putUUID(KEY_TAG, key);
    }
}
