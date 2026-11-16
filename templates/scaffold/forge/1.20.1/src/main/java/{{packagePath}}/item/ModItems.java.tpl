package {{package}}.item;

import net.minecraft.world.item.Item;
import net.minecraftforge.eventbus.api.IEventBus;
import net.minecraftforge.registries.DeferredRegister;
import net.minecraftforge.registries.ForgeRegistries;
import net.minecraftforge.registries.RegistryObject;
import {{package}}.{{ClassName}};

/** 物品注册。新增物品时在此登记，并加入 ModCreativeModeTabs 的创造栏。 */
public final class ModItems {
    public static final DeferredRegister<Item> ITEMS =
            DeferredRegister.create(ForgeRegistries.ITEMS, {{ClassName}}.MODID);

    // 示例：
    // public static final RegistryObject<Item> EXAMPLE =
    //         ITEMS.register("example", () -> new Item(new Item.Properties()));

    public static void register(IEventBus eventBus) {
        ITEMS.register(eventBus);
    }

    private ModItems() {
    }
}
