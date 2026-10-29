# API 索引样例：Lock / Forge 1.20.1

> 用途：验证 [API-INDEX-SPEC.md](../design/API-INDEX-SPEC.md)
> 来源：本机 Gradle 缓存中的 `forge-1.20.1-47.4.16_mapped_parchment_2023.09.03-1.20.1.jar`
> 提取工具：JDK `javap -public`
> 提取日期：2026-10-29

## 1. `meta.json` 样例

```json
{
  "schemaVersion": 1,
  "projectPath": "D:/MCmod/Lock",
  "loader": "forge",
  "mcVersion": "1.20.1",
  "mappings": "parchment 2023.09.03-1.20.1",
  "javaVersion": "17",
  "source": "gradle-classpath",
  "classpathHash": "sha256:sample-not-real",
  "generatedAt": "2026-10-29T00:00:00.000Z",
  "stats": {
    "jars": 1,
    "classes": 5,
    "packages": 5
  }
}
```

> 样张只列 5 个类；真实索引应覆盖 `net.minecraft`、`net.minecraftforge` 等白名单包。

## 2. 类签名

### `net.minecraft.world.item.Item`

```text
public class net.minecraft.world.item.Item
  implements FeatureElement, ItemLike, IForgeItem

  public Item(Item.Properties)
  public final int getMaxStackSize()
  public final int getMaxDamage()
  public InteractionResultHolder<ItemStack> use(Level, Player, InteractionHand)
  public InteractionResult useOn(UseOnContext)
  public boolean hurtEnemy(ItemStack, LivingEntity, LivingEntity)
  public ItemStack finishUsingItem(ItemStack, Level, LivingEntity)
  public String getDescriptionId()
  public Rarity getRarity(ItemStack)
```

### `net.minecraft.world.item.Item$Properties`

```text
public class net.minecraft.world.item.Item$Properties
  public Item.Properties()
  public Item.Properties stacksTo(int)
  public Item.Properties durability(int)
  public Item.Properties defaultDurability(int)
  public Item.Properties rarity(Rarity)
  public Item.Properties food(FoodProperties)
  public Item.Properties fireResistant()
  public Item.Properties setNoRepair()
  public Item.Properties craftRemainder(Item)
  public Item.Properties requiredFeatures(FeatureFlag...)
```

### `net.minecraft.world.level.block.entity.BlockEntity`

```text
public abstract class net.minecraft.world.level.block.entity.BlockEntity
  extends CapabilityProvider<BlockEntity>
  implements IForgeBlockEntity

  public BlockEntity(BlockEntityType<?>, BlockPos, BlockState)
  public void load(CompoundTag)
  protected void saveAdditional(CompoundTag)   // javap -public 不显示，需包含 protected
  public final CompoundTag saveWithoutMetadata()
  public void setChanged()
  public BlockPos getBlockPos()
  public Level getLevel()
  public Packet<ClientGamePacketListener> getUpdatePacket()
  public CompoundTag getUpdateTag()
```

### `net.minecraft.world.MenuProvider`

```text
public interface net.minecraft.world.MenuProvider
  extends MenuConstructor

  public abstract Component getDisplayName()
  // 继承自 MenuConstructor:
  public abstract AbstractContainerMenu createMenu(int, Inventory, Player)
```

### `net.minecraftforge.registries.DeferredRegister<T>`

```text
public class net.minecraftforge.registries.DeferredRegister<T>
  public static <B> DeferredRegister<B> create(IForgeRegistry<B>, String)
  public static <B> DeferredRegister<B> create(ResourceKey<? extends Registry<B>>, String)
  public <I extends T> RegistryObject<I> register(String, Supplier<? extends I>)
  public void register(IEventBus)
  public Collection<RegistryObject<T>> getEntries()
```

### `net.minecraftforge.network.simple.SimpleChannel`

```text
public class net.minecraftforge.network.simple.SimpleChannel
  public <M> MessageBuilder<M> messageBuilder(Class<M>, int)
  public <M> MessageBuilder<M> messageBuilder(Class<M>, int, NetworkDirection)
  public <MSG> void send(PacketDistributor.PacketTarget, MSG)
  public <MSG> int encodeMessage(MSG, FriendlyByteBuf)
```

### `net.minecraft.client.gui.screens.MenuScreens`

```text
public class net.minecraft.client.gui.screens.MenuScreens
  public static <M extends AbstractContainerMenu, U extends Screen & MenuAccess<M>>
    void register(MenuType<? extends M>, ScreenConstructor<M, U>)
```

## 3. 查询结果样式

```text
api.search { query: "stacksTo" }
→
[
  {
    "class": "net.minecraft.world.item.Item$Properties",
    "method": "stacksTo",
    "params": ["int"],
    "returns": "Item.Properties",
    "source": "forge-1.20.1-47.4.16_mapped_parchment_2023.09.03-1.20.1.jar"
  }
]
```

## 4. 这份样例暴露的问题

1. **`javap -public` 不够**：`BlockEntity.saveAdditional` 是 protected，模组经常重写；索引必须包含 protected。
2. **继承方法不在本类输出里**：`MenuProvider.createMenu` 来自 `MenuConstructor`；索引必须合并父类/接口。
3. **嵌套类**：`Item$Properties` 需要保留 `$` 或规范化为 `Item.Properties`，查询时两者都要能命中。
4. **映射必须记录**：Parchment 的参数名/注释与 official 不同；索引必须记录 `mappings`。
5. **classpathHash 不是装饰**：Lock 使用 Forge 47.4.16 + Parchment，换版本签名可能变。
6. **类很多，不能全塞上下文**：任务只取 `apiRefs` 中的类，且有 4KB 预算。

## 5. 结论

- API 索引方案可行，且比“模型记忆”可靠；
- 但实现时不能只跑 `javap -public`，要处理 protected、继承、嵌套类、mapping；
- 样例足以支撑任务包中的 `apiRefs`，下一步可以把索引生成器写进 M2。
