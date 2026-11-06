package {{package}}.data;

import net.minecraft.nbt.CompoundTag;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.saveddata.SavedData;

/** {{displayName}} 的世界持久化数据。 */
public class {{ClassName}}SavedData extends SavedData {
    private CompoundTag data = new CompoundTag();

    public static {{ClassName}}SavedData load(CompoundTag tag) {
        {{ClassName}}SavedData saved = new {{ClassName}}SavedData();
        saved.data = tag.getCompound("data");
        return saved;
    }

    @Override
    public CompoundTag save(CompoundTag tag) {
        tag.put("data", data);
        return tag;
    }

    public CompoundTag getData() {
        return data;
    }

    public void setData(CompoundTag data) {
        this.data = data;
        setDirty();
    }

    public static {{ClassName}}SavedData get(ServerLevel level) {
        return level.getDataStorage().computeIfAbsent(
                {{ClassName}}SavedData::load,
                {{ClassName}}SavedData::new,
                "{{modid}}");
    }
}
