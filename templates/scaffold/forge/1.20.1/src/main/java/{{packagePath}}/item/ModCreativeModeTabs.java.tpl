package {{package}}.item;

import net.minecraft.core.registries.Registries;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.CreativeModeTab;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraftforge.eventbus.api.IEventBus;
import net.minecraftforge.registries.DeferredRegister;
import net.minecraftforge.registries.RegistryObject;
import {{package}}.{{ClassName}};

/** 独立创造栏：本模组所有物品只加入这个标签，不往原版标签注入。 */
public final class ModCreativeModeTabs {
    public static final DeferredRegister<CreativeModeTab> TABS =
            DeferredRegister.create(Registries.CREATIVE_MODE_TAB, {{ClassName}}.MODID);

    public static final RegistryObject<CreativeModeTab> MAIN = TABS.register("main", () -> CreativeModeTab.builder()
            .icon(() -> new ItemStack(Items.STONE))
            .title(Component.translatable("itemGroup.{{modid}}.main"))
            .displayItems((parameters, output) -> {
                // output.accept(ModItems.EXAMPLE.get());
            })
            .build());

    public static void register(IEventBus eventBus) {
        TABS.register(eventBus);
    }

    private ModCreativeModeTabs() {
    }
}
