package {{package}}.entity;

import net.minecraft.world.entity.EntityType;
import net.minecraftforge.eventbus.api.IEventBus;
import net.minecraftforge.registries.DeferredRegister;
import net.minecraftforge.registries.ForgeRegistries;
import {{package}}.{{ClassName}};

/** 实体注册。 */
public final class ModEntities {
    public static final DeferredRegister<EntityType<?>> ENTITIES =
            DeferredRegister.create(ForgeRegistries.ENTITY_TYPES, {{ClassName}}.MODID);

    public static void register(IEventBus eventBus) {
        ENTITIES.register(eventBus);
    }

    private ModEntities() {
    }
}
